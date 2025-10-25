import { SpotifyApi } from '@spotify/web-api-ts-sdk';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { config } from 'dotenv';

config();

const OUTPUT_DIR = path.join(import.meta.dirname, '../data');

const SEARCH_QUERIES = [
  { query: 'genre:pop', name: 'Pop Music' },
  { query: 'genre:hip-hop', name: 'Hip-Hop' },
  { query: 'genre:rock', name: 'Rock' },
  { query: 'genre:electronic', name: 'Electronic' },
  { query: 'genre:r-n-b', name: 'R&B' },
  { query: 'genre:country', name: 'Country' },
  { query: 'genre:jazz', name: 'Jazz' },
  { query: 'genre:latin', name: 'Latin' },
  { query: 'genre:indie', name: 'Indie' },
  { query: 'genre:alternative', name: 'Alternative' },
  { query: 'genre:k-pop', name: 'K-Pop' },
  { query: 'genre:j-pop', name: 'J-Pop' },
];

interface Track {
  id: string;
  href: string;
  name: string;
  artist_ids: string[];
  album_id: string;
  duration: number;
  popularity: number;
  explicit: boolean;
  preview_url: string | null;
}

interface Album {
  id: string;
  href: string;
  name: string;
  artist_ids: string[];
  release_date: string;
  image_url: string | null;
}

interface Artist {
  id: string;
  href: string;
  name: string;
  genres: string[];
  popularity: number;
  image_url: string | null;
}

interface Genre {
  id: string;
  name: string;
}

const clientId = process.env.SPOTIFY_CLIENT_ID;
const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  throw new Error('Missing Spotify credentials. Please set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in .env file.');
}

console.log('🔐 Authenticating with Spotify...');
const spotify = SpotifyApi.withClientCredentials(clientId, clientSecret);

const tracks: Track[] = [];
const albumIds = new Set<string>();
const artistIds = new Set<string>();

console.log('📀 Searching for tracks...\n');

for (const search of SEARCH_QUERIES) {
  console.log(`🔍 Searching: ${search.name}`);

  let offset = 0;
  let trackCount = 0;
  const limit = 50;
  const maxResults = 500;

  try {
    while (offset < maxResults) {
      const response = await spotify.search(search.query, ['track'], undefined, limit, offset);

      if (response.tracks.items?.length === 0) break;

      for (const track of response.tracks.items) {
        if (track?.type !== 'track') continue;

        if (tracks.some((t) => t.id === track.id)) continue;

        tracks.push({
          id: track.id,
          href: track.href,
          name: track.name,
          artist_ids: track.artists.map((a) => a.id),
          album_id: track.album.id,
          duration: track.duration_ms,
          popularity: track.popularity,
          explicit: track.explicit,
          preview_url: track.preview_url ?? null,
        });

        trackCount++;

        albumIds.add(track.album.id);
        for (const artist of track.artists) {
          artistIds.add(artist.id);
        }
      }

      offset += limit;

      if (response.tracks.items.length < limit) break;
    }
  } catch (error) {
    console.error(`   ❌ Error searching ${search.name}:`, error);
  }

  console.log(`   ✓ Added ${trackCount} new tracks\n`);
}

console.log('\n💿 Fetching album details in batches...');
const albums = new Map<string, Album>();
const albumIdsArray = [...albumIds];
const albumBatchSize = 20;

for (let i = 0; i < albumIdsArray.length; i += albumBatchSize) {
  const batch = albumIdsArray.slice(i, i + albumBatchSize);
  try {
    const albumsResponse = await spotify.albums.get(batch);
    for (const album of albumsResponse) {
      albums.set(album.id, {
        id: album.id,
        href: album.href,
        name: album.name,
        artist_ids: album.artists.map((a) => a.id),
        release_date: album.release_date,
        image_url: album.images[0]?.url ?? null,
      });
    }
    console.log(`   ✓ Fetched ${i + batch.length}/${albumIdsArray.length} albums`);
  } catch {
    console.warn(`   ⚠️  Failed to fetch album batch at offset ${i}`);
  }
}

console.log('\n👥 Fetching artist details in batches...');
const artists = new Map<string, Artist>();
const genres = new Set<string>();
const artistIdsArray = [...artistIds];
const artistBatchSize = 50;

for (let i = 0; i < artistIdsArray.length; i += artistBatchSize) {
  const batch = artistIdsArray.slice(i, i + artistBatchSize);
  try {
    const artistsResponse = await spotify.artists.get(batch);
    for (const artist of artistsResponse) {
      artists.set(artist.id, {
        id: artist.id,
        href: artist.href,
        name: artist.name,
        genres: artist.genres,
        popularity: artist.popularity,
        image_url: artist.images[0]?.url ?? null,
      });

      for (const g of artist.genres) genres.add(g);
    }
    console.log(`   ✓ Fetched ${i + batch.length}/${artistIdsArray.length} artists`);
  } catch {
    console.warn(`   ⚠️  Failed to fetch artist batch at offset ${i}`);
  }
}

console.log('\n📊 Collection Summary:');
console.log(`   • ${tracks.length.toLocaleString()} tracks`);
console.log(`   • ${albums.size.toLocaleString()} albums`);
console.log(`   • ${artists.size.toLocaleString()} artists`);
console.log(`   • ${genres.size.toLocaleString()} genres\n`);

console.log('💾 Saving data to JSON files...');

await mkdir(OUTPUT_DIR, { recursive: true });

await writeFile(path.join(OUTPUT_DIR, 'tracks.json'), JSON.stringify(tracks, null, 2));
console.log(`   ✓ tracks.json (${(JSON.stringify(tracks).length / 1024 / 1024).toFixed(2)} MB)`);

const albumsArray = [...albums.values()];
await writeFile(path.join(OUTPUT_DIR, 'albums.json'), JSON.stringify(albumsArray, null, 2));
console.log(`   ✓ albums.json (${(JSON.stringify(albumsArray).length / 1024 / 1024).toFixed(2)} MB)`);

const artistsArray = [...artists.values()];
await writeFile(path.join(OUTPUT_DIR, 'artists.json'), JSON.stringify(artistsArray, null, 2));
console.log(`   ✓ artists.json (${(JSON.stringify(artistsArray).length / 1024 / 1024).toFixed(2)} MB)`);

const genresArray: Genre[] = [...genres].toSorted().map((g) => ({
  id: g,
  name: g
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' '),
}));
await writeFile(path.join(OUTPUT_DIR, 'genres.json'), JSON.stringify(genresArray, null, 2));
console.log(`   ✓ genres.json (${(JSON.stringify(genresArray).length / 1024 / 1024).toFixed(2)} MB)`);

console.log('\n✅ Data collection complete!');
console.log(`📁 Files saved to: ${OUTPUT_DIR}\n`);
