import { A } from '@solidjs/router';
import { createFragment } from '@mearie/solid';
import { graphql } from '$mearie';
import type { MovieCard$key } from '$mearie';
import { Star } from 'lucide-solid';
import { Show } from 'solid-js';

interface MovieCardProps {
  $movie: MovieCard$key;
}

export function MovieCard(props: MovieCardProps) {
  const movie = createFragment(
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
    () => props.$movie,
  );

  const year = () => movie.data.releaseDate?.getFullYear() ?? '';
  const genres = () => movie.data.genres.map((g) => g.name).join(', ');
  const castMembers = () => movie.data.credits.filter((c) => c.__typename === 'Cast');

  return (
    <A href={`/movies/${movie.data.id}`} class="block border border-neutral-200 bg-white overflow-hidden">
      <Show when={movie.data.posterUrl}>
        <img src={movie.data.posterUrl!} alt={movie.data.title} class="w-full aspect-[2/3] object-cover" />
      </Show>

      <div class="p-4 space-y-1.5">
        <div class="flex items-center justify-between gap-1.5">
          <h3 class="text-sm font-semibold text-neutral-950 line-clamp-1 flex-1">{movie.data.title}</h3>
          <Show when={movie.data.rating}>
            <div class="flex items-center gap-0.5 flex-shrink-0">
              <Star class="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />
              <span class="text-sm text-neutral-950 font-semibold">{movie.data.rating!.toFixed(1)}</span>
            </div>
          </Show>
        </div>

        <Show when={castMembers().length > 0}>
          <p class="text-xs text-neutral-500 line-clamp-1">
            {castMembers()
              .slice(0, 3)
              .map((c) => c.person.name)
              .join(', ')}
          </p>
        </Show>

        <p class="flex items-center text-xs text-neutral-400 line-clamp-1">
          <Show when={year()}>
            <span>{year()}</span>
          </Show>
          <Show when={year() && genres()}>
            <span class="w-0.5 h-0.5 rounded-full bg-neutral-400 mx-1 flex-shrink-0" />
          </Show>
          <Show when={genres()}>
            <span class="truncate">{genres()}</span>
          </Show>
        </p>
      </div>
    </A>
  );
}
