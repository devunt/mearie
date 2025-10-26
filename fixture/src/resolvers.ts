import { faker } from '@faker-js/faker';
import movies from '../data/movies.json' with { type: 'json' };
import people from '../data/people.json' with { type: 'json' };
import genres from '../data/genres.json' with { type: 'json' };

type Movie = (typeof movies)[number];
type Person = (typeof people)[number];
type Genre = (typeof genres)[number];

interface Review {
  id: string;
  movieId: string;
  rating: number;
  text: string | null;
  createdAt: string;
}

const movieMap = new Map<string, Movie>(movies.map((m) => [m.id, m]));
const personMap = new Map<string, Person>(people.map((p) => [p.id, p]));
const genreMap = new Map<string, Genre>(genres.map((g) => [g.id, g]));

const reviews = new Map<string, Review>();

const eventTarget = new EventTarget();

const encodeGlobalId = (type: string, id: string): string => {
  return Buffer.from(`${type}:${id}`).toString('base64').replaceAll('=', '');
};

const decodeGlobalId = (globalId: string): { type: string; id: string } | null => {
  try {
    const padded = globalId + '='.repeat((4 - (globalId.length % 4)) % 4);
    const decoded = Buffer.from(padded, 'base64').toString('utf8');
    const [type, id] = decoded.split(':');
    return type && id ? { type, id } : null;
  } catch {
    return null;
  }
};

const generateReview = (movieId: string): Review => {
  return {
    id: faker.string.uuid(),
    movieId,
    rating: faker.number.float({ min: 1, max: 5, fractionDigits: 1 }),
    text: faker.helpers.maybe(() => faker.lorem.paragraph(), { probability: 0.8 }) ?? null,
    createdAt: faker.date.recent().toISOString(),
  };
};

const encodeCursor = (index: number): string => {
  return Buffer.from(String(index)).toString('base64').replaceAll('=', '');
};

const decodeCursor = (cursor: string): number => {
  try {
    const padded = cursor + '='.repeat((4 - (cursor.length % 4)) % 4);
    return Number.parseInt(Buffer.from(padded, 'base64').toString('utf8'), 10);
  } catch {
    return 0;
  }
};

const filterMovies = (
  movieList: Movie[],
  filter?: {
    genreIds?: string[] | null;
  },
): Movie[] => {
  if (!filter) return movieList;

  return movieList.filter((movie) => {
    if (filter.genreIds && filter.genreIds.length > 0) {
      const hasMatchingGenre = filter.genreIds.some((genreId) => {
        const decoded = decodeGlobalId(genreId);
        return decoded?.type === 'Genre' && movie.genre_ids.includes(decoded.id);
      });
      if (!hasMatchingGenre) return false;
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
        case 'Movie': {
          return movieMap.get(id);
        }
        case 'Person': {
          return personMap.get(id);
        }
        case 'Genre': {
          return genreMap.get(id);
        }
        case 'Review': {
          return reviews.get(id);
        }
        default: {
          return null;
        }
      }
    },

    movie: (_parent: unknown, args: { id: string }) => {
      const decoded = decodeGlobalId(args.id);
      if (decoded?.type !== 'Movie') return null;
      return movieMap.get(decoded.id) ?? null;
    },
    person: (_parent: unknown, args: { id: string }) => {
      const decoded = decodeGlobalId(args.id);
      if (decoded?.type !== 'Person') return null;
      return personMap.get(decoded.id) ?? null;
    },
    genre: (_parent: unknown, args: { id: string }) => {
      const decoded = decodeGlobalId(args.id);
      if (decoded?.type !== 'Genre') return null;
      return genreMap.get(decoded.id) ?? null;
    },

    movies: (
      _parent: unknown,
      args: {
        first?: number;
        after?: string;
        filter?: {
          genreIds?: string[] | null;
        };
      },
    ) => {
      const limit = Math.min(args.first ?? 20, 100);
      const afterIndex = args.after ? decodeCursor(args.after) : -1;

      const filteredMovies = filterMovies([...movies], args.filter);

      const startIndex = afterIndex + 1;
      const endIndex = startIndex + limit;
      const pageItems = filteredMovies.slice(startIndex, endIndex);

      return {
        edges: pageItems.map((movie, i) => ({
          cursor: encodeCursor(startIndex + i),
          node: movie,
        })),
        pageInfo: {
          hasNextPage: endIndex < filteredMovies.length,
          hasPreviousPage: startIndex > 0,
          startCursor: pageItems.length > 0 ? encodeCursor(startIndex) : null,
          endCursor: pageItems.length > 0 ? encodeCursor(endIndex - 1) : null,
        },
        totalCount: filteredMovies.length,
      };
    },

    people: (_parent: unknown, args: { offset?: number; limit?: number }) => {
      const offset = args.offset ?? 0;
      const limit = Math.min(args.limit ?? 20, 100);

      const items = people.slice(offset, offset + limit);

      return {
        items,
        total: people.length,
        offset,
        limit,
        hasMore: offset + limit < people.length,
      };
    },

    genres: () => genres,

    search: (_parent: unknown, args: { query: string; limit?: number }) => {
      const query = args.query.toLowerCase();
      const limit = args.limit ?? 10;
      const results: (Movie | Person)[] = [];

      for (const movie of movies) {
        if (movie.title.toLowerCase().includes(query)) {
          results.push(movie);
          if (results.length >= limit) break;
        }
      }

      if (results.length < limit) {
        for (const person of people) {
          if (person.name.toLowerCase().includes(query)) {
            results.push(person);
            if (results.length >= limit) break;
          }
        }
      }

      return results;
    },
  },

  Mutation: {
    createReview: (_parent: unknown, args: { input: { movieId: string; rating: number; text?: string } }) => {
      const decodedMovie = decodeGlobalId(args.input.movieId);
      if (decodedMovie?.type !== 'Movie') throw new Error('Invalid movie ID');

      const review = generateReview(decodedMovie.id);
      review.rating = args.input.rating;
      review.text = args.input.text ?? null;

      reviews.set(review.id, review);
      eventTarget.dispatchEvent(new CustomEvent('reviewAdded', { detail: review }));

      return review;
    },

    deleteReview: (_parent: unknown, args: { id: string }) => {
      const decoded = decodeGlobalId(args.id);
      if (decoded?.type !== 'Review') return false;
      return reviews.delete(decoded.id);
    },
  },

  Subscription: {
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
    __resolveType(obj: Movie | Person | Genre | Review) {
      if ('title' in obj && 'plot' in obj) return 'Movie';
      if ('name' in obj && 'image_url' in obj && !('displayName' in obj)) return 'Person';
      if ('movieId' in obj && 'rating' in obj) return 'Review';
      if ('displayName' in obj || ('name' in obj && !('image_url' in obj))) return 'Genre';
      return null;
    },
  },

  SearchResult: {
    __resolveType(obj: Movie | Person) {
      if ('title' in obj) return 'Movie';
      if ('name' in obj) return 'Person';
      return null;
    },
  },

  Credit: {
    __resolveType(obj: { type: string }) {
      return obj.type === 'cast' ? 'Cast' : 'Crew';
    },
  },

  Cast: {
    id: (credit: { person_id: string }) => encodeGlobalId('Cast', credit.person_id),
    person: (credit: { person_id: string }) => personMap.get(credit.person_id),
    character: (credit: { character?: string | null }) => credit.character,
  },

  Crew: {
    id: (credit: { person_id: string }) => encodeGlobalId('Crew', credit.person_id),
    person: (credit: { person_id: string }) => personMap.get(credit.person_id),
    department: (credit: { department?: string | null }) => credit.department,
    job: (credit: { job?: string | null }) => credit.job,
  },

  Movie: {
    id: (movie: Movie) => encodeGlobalId('Movie', movie.id),
    posterUrl: (movie: Movie) => movie.poster_url,
    backdropUrl: (movie: Movie) => movie.backdrop_url,
    imdbId: (movie: Movie) => movie.imdb_id,
    releaseDate: (movie: Movie) => movie.release_date,
    runtime: (movie: Movie) => movie.runtime,
    rating: (movie: Movie) => movie.rating,
    cast: (movie: Movie) =>
      movie.credits
        .filter((c) => c.type === 'cast')
        .map((c) => personMap.get(c.person_id))
        .filter(Boolean),
    credits: (movie: Movie) => movie.credits,
    genres: (movie: Movie) => movie.genre_ids.map((id) => genreMap.get(id)).filter(Boolean),
    reviews: (movie: Movie) => {
      return [...reviews.values()].filter((r) => r.movieId === movie.id);
    },
  },

  Person: {
    id: (person: Person) => encodeGlobalId('Person', person.id),
    imageUrl: (person: Person) => person.image_url,
    movies: (person: Person) => movies.filter((m) => m.credits.some((c) => c.person_id === person.id)),
  },

  Genre: {
    id: (genre: Genre) => encodeGlobalId('Genre', genre.id),
    displayName: (genre: Genre) => genre.name,
    movies: (genre: Genre) => movies.filter((m) => m.genre_ids.includes(genre.id)),
  },

  Review: {
    id: (review: Review) => encodeGlobalId('Review', review.id),
    movie: (review: Review) => movieMap.get(review.movieId),
  },
};
