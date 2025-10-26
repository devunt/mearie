import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { config } from 'dotenv';

config();

const dataDir = path.join(import.meta.dirname, '../data');

const SAMPLE_SIZE = 2000;
const BATCH_SIZE = 20;

const years = Array.from({ length: 50 }, (_, i) => 2025 - i);
const MOVIES_PER_YEAR = Math.ceil(SAMPLE_SIZE / years.length);

const TMDB_API_KEY = process.env.TMDB_API_KEY;

if (!TMDB_API_KEY) {
  throw new Error(
    'TMDB_API_KEY environment variable is not set. Get your API key from: https://www.themoviedb.org/settings/api',
  );
}

interface TMDBGenre {
  id: number;
  name: string;
}

interface TMDBMovie {
  id: number;
  title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  imdb_id: string | null;
  runtime: number | null;
  vote_average: number | null;
  genres: TMDBGenre[];
  credits?: TMDBCreditsResponse;
}

interface TMDBCastMember {
  id: number;
  name: string;
  character: string;
  order: number;
  profile_path: string | null;
}

interface TMDBCrewMember {
  id: number;
  name: string;
  job: string;
  department: string;
  profile_path: string | null;
}

interface TMDBCreditsResponse {
  cast: TMDBCastMember[];
  crew: TMDBCrewMember[];
}

interface TMDBDiscoverMovie {
  id: number;
  title: string;
  genre_ids: number[];
}

interface TMDBDiscoverResponse {
  results: TMDBDiscoverMovie[];
}

interface Credit {
  person_id: string;
  type: 'cast' | 'crew';
  character?: string | null;
  department?: string | null;
  job?: string | null;
}

interface Movie {
  id: string;
  title: string;
  release_date: string;
  plot: string;
  poster_url: string | null;
  backdrop_url: string | null;
  imdb_id: string | null;
  runtime: number | null;
  rating: number | null;
  credits: Credit[];
  genre_ids: string[];
}

interface Person {
  id: string;
  name: string;
  image_url: string | null;
}

interface Genre {
  id: string;
  name: string;
}

const processBatch = async <T, R>(items: T[], batchSize: number, processor: (item: T) => Promise<R>): Promise<R[]> => {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map((item) => processor(item)));
    results.push(...batchResults);
  }
  return results;
};

const tmdbFetch = async <T>(endpoint: string, params: Record<string, string> = {}): Promise<T> => {
  const url = new URL(`https://api.themoviedb.org/3${endpoint}`);
  url.searchParams.set('api_key', TMDB_API_KEY);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`TMDB API error: ${response.statusText}`);
  }
  return response.json() as Promise<T>;
};

console.log('Fetching movies from TMDB...\n');

const allMovies: Movie[] = [];
const peopleMap = new Map<string, Person>();
const genreMap = new Map<string, Genre>();

const moviesToFetch = new Set<number>();

for (const year of years) {
  console.log(`Discovering movies from ${year}...`);

  let movieCount = 0;
  let page = 1;

  while (movieCount < MOVIES_PER_YEAR) {
    const data = await tmdbFetch<TMDBDiscoverResponse>('/discover/movie', {
      primary_release_year: year.toString(),
      sort_by: 'popularity.desc',
      page: page.toString(),
      'vote_count.gte': '100',
    });

    if (!data.results || data.results.length === 0) break;

    for (const movie of data.results) {
      if (movieCount >= MOVIES_PER_YEAR) break;

      moviesToFetch.add(movie.id);

      movieCount++;
    }

    page++;
  }

  console.log(`  Found ${movieCount} movies from ${year}`);
}

console.log(`\nFetching details for ${moviesToFetch.size} movies in batches of ${BATCH_SIZE}...`);

let processedCount = 0;
const movieIds = [...moviesToFetch];

await processBatch(movieIds, BATCH_SIZE, async (tmdbId) => {
  try {
    const movieDetails = await tmdbFetch<TMDBMovie>(`/movie/${tmdbId}`, {
      append_to_response: 'credits',
    });

    const creditsData = movieDetails.credits;
    if (!creditsData) return;

    const posterUrl = movieDetails.poster_path ? `https://image.tmdb.org/t/p/w500${movieDetails.poster_path}` : null;
    const backdropUrl = movieDetails.backdrop_path
      ? `https://image.tmdb.org/t/p/w1280${movieDetails.backdrop_path}`
      : null;

    const genreIds: string[] = [];
    for (const genre of movieDetails.genres) {
      const genreId = genre.id.toString();
      genreIds.push(genreId);

      if (!genreMap.has(genreId)) {
        genreMap.set(genreId, {
          id: genreId,
          name: genre.name,
        });
      }
    }

    const credits: Credit[] = [];

    for (const cast of creditsData.cast.slice(0, 3)) {
      const personId = cast.id.toString();

      if (!peopleMap.has(personId)) {
        peopleMap.set(personId, {
          id: personId,
          name: cast.name,
          image_url: cast.profile_path ? `https://image.tmdb.org/t/p/w185${cast.profile_path}` : null,
        });
      }

      credits.push({
        person_id: personId,
        type: 'cast',
        character: cast.character || null,
      });
    }

    for (const crew of creditsData.crew.slice(0, 2)) {
      const personId = crew.id.toString();

      if (!peopleMap.has(personId)) {
        peopleMap.set(personId, {
          id: personId,
          name: crew.name,
          image_url: crew.profile_path ? `https://image.tmdb.org/t/p/w185${crew.profile_path}` : null,
        });
      }

      credits.push({
        person_id: personId,
        type: 'crew',
        department: crew.department || null,
        job: crew.job || null,
      });
    }

    allMovies.push({
      id: tmdbId.toString(),
      title: movieDetails.title,
      release_date: movieDetails.release_date ?? '',
      plot: movieDetails.overview ?? '',
      poster_url: posterUrl,
      backdrop_url: backdropUrl,
      imdb_id: movieDetails.imdb_id ?? null,
      runtime: movieDetails.runtime ?? null,
      rating: movieDetails.vote_average ?? null,
      credits,
      genre_ids: genreIds,
    });

    processedCount++;
    if (processedCount % 100 === 0) {
      console.log(`  Processed ${processedCount}/${movieIds.length} movies...`);
    }
  } catch (error) {
    console.error(`Error fetching movie ID ${tmdbId}:`, error);
  }
});

console.log(`  Completed: ${allMovies.length}/${movieIds.length} movies fetched successfully`);

console.log(`\nTotal fetched: ${allMovies.length} movies, ${peopleMap.size} people, ${genreMap.size} genres`);

const people = [...peopleMap.values()];
const genres = [...genreMap.values()];

const moviesJson = JSON.stringify(allMovies, null, 2);
const peopleJson = JSON.stringify(people, null, 2);
const genresJson = JSON.stringify(genres, null, 2);

writeFileSync(path.join(dataDir, 'movies.json'), moviesJson);
writeFileSync(path.join(dataDir, 'people.json'), peopleJson);
writeFileSync(path.join(dataDir, 'genres.json'), genresJson);

console.log('\n✅ Data files created successfully!');

const moviesSize = (moviesJson.length / 1024).toFixed(2);
const peopleSize = (peopleJson.length / 1024).toFixed(2);
const genresSize = (genresJson.length / 1024).toFixed(2);
const totalSize = (
  Number.parseFloat(moviesSize) +
  Number.parseFloat(peopleSize) +
  Number.parseFloat(genresSize)
).toFixed(2);

console.log(`\nFile sizes:`);
console.log(`  movies.json: ${moviesSize} KB`);
console.log(`  people.json: ${peopleSize} KB`);
console.log(`  genres.json: ${genresSize} KB`);
console.log(`  Total: ${totalSize} KB`);
