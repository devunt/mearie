# @mearie/fixture

TMDB movie dataset fixture for Mearie examples and tests.

This package provides movie data from The Movie Database (TMDB) including movies, people (actors/crew),
and genres for use in examples and end-to-end tests. The dataset includes movie metadata,
credits information, and poster images.

## Dataset

The fixture includes:

- **Movies** - Movie information with metadata (title, release date, plot, poster URL, etc.)
- **People** - Actors and crew members who worked on movies
- **Genres** - Movie genre categories

Data is stored in JSON format in the `data/` directory:

- `data/movies.json` - 2,000 movies from 1975-2025
- `data/people.json` - People associated with the movies
- `data/genres.json` - Movie genres used in the dataset

## Updating Data

To fetch fresh movie data from TMDB:

1. Get a free TMDB API key:
   - Sign up at https://www.themoviedb.org/
   - Go to https://www.themoviedb.org/settings/api
   - Request an API key (free for non-commercial use)

2. Run the fetch script with your API key:

```bash
TMDB_API_KEY=your_api_key_here pnpm fetch-data
```

This script efficiently downloads movies from The Movie Database (TMDB) across 50 years (1975-2025),
with optimized batch processing and automatic deduplication.

The script will:

- Discover popular movies from each year (with vote count ≥100)
- Fetch up to ~40 movies per year (configurable via `SAMPLE_SIZE`)
- Batch process movie details and credits in parallel (20 at a time)
- Include top 3 cast members and top 2 crew members per movie
- Store full plot summaries and metadata without truncation
- Only include people and genres actually used in the dataset

## Data Source

Movie data is sourced from The Movie Database (TMDB) API. This product uses the TMDB API but
is not endorsed or certified by TMDB.

- Movie metadata: titles, plots, release dates, ratings, runtime, genres
- Movie posters and backdrops: High-quality images
- Credits information: Cast (actors) and crew members with their roles

TMDB data is free to use for non-commercial purposes with attribution.

## Documentation

Full documentation is available at <https://mearie.dev/>.
