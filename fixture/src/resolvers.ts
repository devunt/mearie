import { faker } from '@faker-js/faker';
import tracks from '../data/tracks.json' with { type: 'json' };
import albums from '../data/albums.json' with { type: 'json' };
import artists from '../data/artists.json' with { type: 'json' };
import genres from '../data/genres.json' with { type: 'json' };

type Track = (typeof tracks)[number];
type Album = (typeof albums)[number];
type Artist = (typeof artists)[number];
type Genre = (typeof genres)[number];

interface Playlist {
  id: string;
  name: string;
  description: string | null;
  trackIds: string[];
  createdAt: string;
}

interface Review {
  id: string;
  trackId: string;
  rating: number;
  text: string | null;
  createdAt: string;
}

const trackMap = new Map<string, Track>(tracks.map((t) => [t.id, t]));
const albumMap = new Map<string, Album>(albums.map((a) => [a.id, a]));
const artistMap = new Map<string, Artist>(artists.map((a) => [a.id, a]));
const genreMap = new Map<string, Genre>(genres.map((g) => [g.id, g]));

const playlists = new Map<string, Playlist>();
const reviews = new Map<string, Review>();

const eventTarget = new EventTarget();

const encodeGlobalId = (type: string, id: string): string => {
  return Buffer.from(`${type}:${id}`).toString('base64');
};

const decodeGlobalId = (globalId: string): { type: string; id: string } | null => {
  try {
    const decoded = Buffer.from(globalId, 'base64').toString('utf8');
    const [type, id] = decoded.split(':');
    return type && id ? { type, id } : null;
  } catch {
    return null;
  }
};

const generatePlaylist = (trackIds?: string[]): Playlist => {
  const id = faker.string.uuid();
  const selectedTrackIds =
    trackIds ??
    faker.helpers.arrayElements(
      tracks.map((t) => t.id),
      faker.number.int({ min: 5, max: 20 }),
    );

  return {
    id,
    name: `${faker.music.genre()} ${faker.word.adjective()} Mix`,
    description: faker.helpers.maybe(() => faker.lorem.sentence(), { probability: 0.7 }) ?? null,
    trackIds: selectedTrackIds,
    createdAt: faker.date.recent().toISOString(),
  };
};

const generateReview = (trackId: string): Review => {
  return {
    id: faker.string.uuid(),
    trackId,
    rating: faker.number.float({ min: 1, max: 5, fractionDigits: 1 }),
    text: faker.helpers.maybe(() => faker.lorem.paragraph(), { probability: 0.8 }) ?? null,
    createdAt: faker.date.recent().toISOString(),
  };
};

const encodeCursor = (index: number): string => {
  return Buffer.from(String(index)).toString('base64');
};

const decodeCursor = (cursor: string): number => {
  try {
    return Number.parseInt(Buffer.from(cursor, 'base64').toString('utf8'), 10);
  } catch {
    return 0;
  }
};

const filterTracks = (
  trackList: Track[],
  filter?: {
    explicit?: boolean | null;
    popularity?: { min?: number | null; max?: number | null } | null;
  },
): Track[] => {
  if (!filter) return trackList;

  return trackList.filter((track) => {
    if (filter.explicit !== null && filter.explicit !== undefined && track.explicit !== filter.explicit) {
      return false;
    }

    if (filter.popularity) {
      const { min, max } = filter.popularity;
      if (min !== null && min !== undefined && track.popularity < min) return false;
      if (max !== null && max !== undefined && track.popularity > max) return false;
    }

    return true;
  });
};

export const resolvers = {
  Query: {
    node: (_parent: unknown, args: { id: string }) => {
      const decoded = decodeGlobalId(args.id);
      if (!decoded) return null;

      const { type, id } = decoded;

      switch (type) {
        case 'Track': {
          return trackMap.get(id);
        }
        case 'Album': {
          return albumMap.get(id);
        }
        case 'Artist': {
          return artistMap.get(id);
        }
        case 'Genre': {
          return genreMap.get(id);
        }
        case 'Playlist': {
          return playlists.get(id);
        }
        case 'Review': {
          return reviews.get(id);
        }
        default: {
          return null;
        }
      }
    },

    track: (_parent: unknown, args: { id: string }) => trackMap.get(args.id) ?? null,
    album: (_parent: unknown, args: { id: string }) => albumMap.get(args.id) ?? null,
    artist: (_parent: unknown, args: { id: string }) => artistMap.get(args.id) ?? null,
    genre: (_parent: unknown, args: { id: string }) => genreMap.get(args.id) ?? null,
    playlist: (_parent: unknown, args: { id: string }) => playlists.get(args.id) ?? null,

    tracks: (
      _parent: unknown,
      args: {
        first?: number;
        after?: string;
        sort?: 'ASC' | 'DESC';
        filter?: {
          explicit?: boolean | null;
          popularity?: { min?: number | null; max?: number | null } | null;
        };
      },
    ) => {
      const limit = Math.min(args.first ?? 20, 100);
      const afterIndex = args.after ? decodeCursor(args.after) : -1;

      const filteredTracks = filterTracks([...tracks], args.filter);

      if (args.sort === 'ASC') {
        filteredTracks.sort((a, b) => a.popularity - b.popularity);
      } else {
        filteredTracks.sort((a, b) => b.popularity - a.popularity);
      }

      const startIndex = afterIndex + 1;
      const endIndex = startIndex + limit;
      const pageItems = filteredTracks.slice(startIndex, endIndex);

      return {
        edges: pageItems.map((track, i) => ({
          cursor: encodeCursor(startIndex + i),
          node: track,
        })),
        pageInfo: {
          hasNextPage: endIndex < filteredTracks.length,
          hasPreviousPage: startIndex > 0,
          startCursor: pageItems.length > 0 ? encodeCursor(startIndex) : null,
          endCursor: pageItems.length > 0 ? encodeCursor(endIndex - 1) : null,
        },
        totalCount: filteredTracks.length,
      };
    },

    albums: (_parent: unknown, args: { offset?: number; limit?: number }) => {
      const offset = args.offset ?? 0;
      const limit = Math.min(args.limit ?? 20, 100);

      const items = albums.slice(offset, offset + limit);

      return {
        items,
        total: albums.length,
        offset,
        limit,
        hasMore: offset + limit < albums.length,
      };
    },

    artists: () => artists,
    genres: () => genres,

    search: (_parent: unknown, args: { query: string; limit?: number }) => {
      const query = args.query.toLowerCase();
      const limit = args.limit ?? 10;
      const results: (Track | Album | Artist)[] = [];

      for (const track of tracks) {
        if (track.name.toLowerCase().includes(query)) {
          results.push(track);
          if (results.length >= limit) break;
        }
      }

      if (results.length < limit) {
        for (const album of albums) {
          if (album.name.toLowerCase().includes(query)) {
            results.push(album);
            if (results.length >= limit) break;
          }
        }
      }

      if (results.length < limit) {
        for (const artist of artists) {
          if (artist.name.toLowerCase().includes(query)) {
            results.push(artist);
            if (results.length >= limit) break;
          }
        }
      }

      return results;
    },
  },

  Mutation: {
    createPlaylist: (
      _parent: unknown,
      args: { input: { name: string; description?: string; trackIds?: string[] } },
    ) => {
      const playlist = generatePlaylist(args.input.trackIds);
      playlist.name = args.input.name;
      playlist.description = args.input.description ?? null;

      playlists.set(playlist.id, playlist);
      eventTarget.dispatchEvent(new CustomEvent('playlistUpdated', { detail: playlist }));

      return playlist;
    },

    deletePlaylist: (_parent: unknown, args: { id: string }) => {
      const deleted = playlists.delete(args.id);
      return deleted;
    },

    addTrackToPlaylist: (_parent: unknown, args: { playlistId: string; trackId: string }) => {
      const playlist = playlists.get(args.playlistId);
      if (!playlist) throw new Error('Playlist not found');

      if (!playlist.trackIds.includes(args.trackId)) {
        playlist.trackIds.push(args.trackId);
        eventTarget.dispatchEvent(new CustomEvent('playlistUpdated', { detail: playlist }));
      }

      return playlist;
    },

    removeTrackFromPlaylist: (_parent: unknown, args: { playlistId: string; trackId: string }) => {
      const playlist = playlists.get(args.playlistId);
      if (!playlist) throw new Error('Playlist not found');

      playlist.trackIds = playlist.trackIds.filter((id) => id !== args.trackId);
      eventTarget.dispatchEvent(new CustomEvent('playlistUpdated', { detail: playlist }));

      return playlist;
    },

    createReview: (_parent: unknown, args: { input: { trackId: string; rating: number; text?: string } }) => {
      const review = generateReview(args.input.trackId);
      review.rating = args.input.rating;
      review.text = args.input.text ?? null;

      reviews.set(review.id, review);
      eventTarget.dispatchEvent(new CustomEvent('reviewAdded', { detail: review }));

      return review;
    },

    deleteReview: (_parent: unknown, args: { id: string }) => {
      return reviews.delete(args.id);
    },
  },

  Subscription: {
    playlistUpdated: {
      subscribe: () => {
        const asyncIterator = {
          [Symbol.asyncIterator]() {
            const queue: Playlist[] = [];
            let resolveNext: ((value: IteratorResult<Playlist>) => void) | null = null;

            const handler = (event: Event) => {
              const playlist = (event as CustomEvent<Playlist>).detail;
              if (resolveNext) {
                resolveNext({ value: playlist, done: false });
                resolveNext = null;
              } else {
                queue.push(playlist);
              }
            };

            eventTarget.addEventListener('playlistUpdated', handler);

            return {
              next() {
                if (queue.length > 0) {
                  return Promise.resolve({ value: queue.shift()!, done: false });
                }

                return new Promise<IteratorResult<Playlist>>((resolve) => {
                  resolveNext = resolve;
                });
              },
              return() {
                eventTarget.removeEventListener('playlistUpdated', handler);
                return Promise.resolve({ value: undefined, done: true });
              },
              throw(error: Error) {
                eventTarget.removeEventListener('playlistUpdated', handler);
                return Promise.reject(error);
              },
            };
          },
        };

        return asyncIterator;
      },
      resolve: (payload: Playlist) => payload,
    },

    reviewAdded: {
      subscribe: () => {
        const asyncIterator = {
          [Symbol.asyncIterator]() {
            const queue: Review[] = [];
            let resolveNext: ((value: IteratorResult<Review>) => void) | null = null;

            const handler = (event: Event) => {
              const review = (event as CustomEvent<Review>).detail;
              if (resolveNext) {
                resolveNext({ value: review, done: false });
                resolveNext = null;
              } else {
                queue.push(review);
              }
            };

            eventTarget.addEventListener('reviewAdded', handler);

            return {
              next() {
                if (queue.length > 0) {
                  return Promise.resolve({ value: queue.shift()!, done: false });
                }

                return new Promise<IteratorResult<Review>>((resolve) => {
                  resolveNext = resolve;
                });
              },
              return() {
                eventTarget.removeEventListener('reviewAdded', handler);
                return Promise.resolve({ value: undefined, done: true });
              },
              throw(error: Error) {
                eventTarget.removeEventListener('reviewAdded', handler);
                return Promise.reject(error);
              },
            };
          },
        };

        return asyncIterator;
      },
      resolve: (payload: Review) => payload,
    },
  },

  Node: {
    __resolveType(obj: Track | Album | Artist | Genre | Playlist | Review) {
      if ('duration' in obj && 'explicit' in obj) return 'Track';
      if ('release_date' in obj || 'releaseDate' in obj) return 'Album';
      if ('genres' in obj && Array.isArray(obj.genres) && obj.genres.length >= 0 && !('explicit' in obj))
        return 'Artist';
      if ('trackIds' in obj) return 'Playlist';
      if ('trackId' in obj && 'rating' in obj) return 'Review';
      if ('displayName' in obj) return 'Genre';
      if ('name' in obj && !('href' in obj)) return 'Genre';
      return null;
    },
  },

  MediaItem: {
    __resolveType(obj: Track | Album | Artist) {
      if ('duration' in obj && 'explicit' in obj) return 'Track';
      if ('release_date' in obj || 'releaseDate' in obj) return 'Album';
      if ('genres' in obj && Array.isArray(obj.genres)) return 'Artist';
      return null;
    },
  },

  SearchResult: {
    __resolveType(obj: Track | Album | Artist) {
      if ('duration' in obj && 'explicit' in obj) return 'Track';
      if ('release_date' in obj || 'releaseDate' in obj) return 'Album';
      if ('genres' in obj && Array.isArray(obj.genres)) return 'Artist';
      return null;
    },
  },

  Track: {
    id: (track: Track) => encodeGlobalId('Track', track.id),
    imageUrl: (track: Track) => albumMap.get(track.album_id)?.image_url ?? null,
    artists: (track: Track) => track.artist_ids.map((id) => artistMap.get(id)).filter(Boolean),
    album: (track: Track) => albumMap.get(track.album_id),
    previewUrl: (track: Track) => track.preview_url,
    reviews: (track: Track) => {
      return [...reviews.values()].filter((r) => r.trackId === track.id);
    },
  },

  Album: {
    id: (album: Album) => encodeGlobalId('Album', album.id),
    imageUrl: (album: Album) => album.image_url,
    artists: (album: Album) => album.artist_ids.map((id) => artistMap.get(id)).filter(Boolean),
    releaseDate: (album: Album) => new Date(album.release_date).toISOString(),
    tracks: (album: Album) => tracks.filter((t) => t.album_id === album.id),
  },

  Artist: {
    id: (artist: Artist) => encodeGlobalId('Artist', artist.id),
    imageUrl: (artist: Artist) => artist.image_url,
    genres: (artist: Artist) => artist.genres.map((g) => genreMap.get(g)).filter(Boolean),
    albums: (artist: Artist) => albums.filter((a) => a.artist_ids.includes(artist.id)),
    tracks: (artist: Artist) => tracks.filter((t) => t.artist_ids.includes(artist.id)),
  },

  Genre: {
    id: (genre: Genre) => encodeGlobalId('Genre', genre.id),
    displayName: (genre: Genre) => genre.name,
    artists: (genre: Genre) => artists.filter((a) => a.genres.includes(genre.id)),
  },

  Playlist: {
    id: (playlist: Playlist) => encodeGlobalId('Playlist', playlist.id),
    tracks: (playlist: Playlist) => playlist.trackIds.map((id) => trackMap.get(id)).filter(Boolean),
    trackCount: (playlist: Playlist) => playlist.trackIds.length,
  },

  Review: {
    id: (review: Review) => encodeGlobalId('Review', review.id),
    track: (review: Review) => trackMap.get(review.trackId),
  },
};
