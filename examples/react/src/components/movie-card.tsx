import { Link } from '@tanstack/react-router';
import { useFragment } from '@mearie/react';
import { graphql } from '~graphql';
import type { MovieCard$key } from '~graphql';
import { Star } from 'lucide-react';

interface MovieCardProps {
  $movie: MovieCard$key;
}

const getYearFromDate = (date: string | null | undefined): string => {
  if (!date) return '';
  return date.split('-')[0] || '';
};

export function MovieCard({ $movie }: MovieCardProps) {
  const movie = useFragment(
    graphql(`
      fragment MovieCard on Movie {
        __typename
        id
        title
        posterUrl
        rating
        releaseDate

        credits {
          __typename

          ... on Cast {
            id
            character

            person {
              id
              name
            }
          }

          ... on Crew {
            id
            job

            person {
              id
              name
            }
          }
        }

        genres {
          id
          name
        }
      }
    `),
    $movie,
  );

  const year = getYearFromDate(movie.releaseDate as string);
  const genres = movie.genres.map((g) => g.name).join(', ');

  return (
    <Link
      to="/movies/$movieId"
      params={{ movieId: movie.id }}
      className="block border border-neutral-200 bg-white overflow-hidden"
    >
      {movie.posterUrl && (
        <img src={movie.posterUrl as string} alt={movie.title} className="w-full aspect-[2/3] object-cover" />
      )}

      <div className="p-4 space-y-1.5">
        <div className="flex items-center justify-between gap-1.5">
          <h3 className="text-sm font-semibold text-neutral-950 line-clamp-1 flex-1">{movie.title}</h3>
          {movie.rating && (
            <div className="flex items-center gap-0.5 flex-shrink-0">
              <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />
              <span className="text-sm text-neutral-950 font-semibold">{movie.rating.toFixed(1)}</span>
            </div>
          )}
        </div>

        {movie.credits.filter((c) => c.__typename === 'Cast').length > 0 && (
          <p className="text-xs text-neutral-500 line-clamp-1">
            {movie.credits
              .filter((c) => c.__typename === 'Cast')
              .slice(0, 3)
              .map((c) => (c.__typename === 'Cast' ? c.person.name : ''))
              .join(', ')}
          </p>
        )}

        <p className="flex items-center text-xs text-neutral-400 line-clamp-1">
          {year && <span>{year}</span>}
          {year && genres && <span className="w-0.5 h-0.5 rounded-full bg-neutral-400 mx-1 flex-shrink-0" />}
          {genres && <span className="truncate">{genres}</span>}
        </p>
      </div>
    </Link>
  );
}
