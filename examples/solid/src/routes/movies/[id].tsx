import { useParams } from '@solidjs/router';
import { createQuery } from '@mearie/solid';
import { graphql } from '$mearie';
import { Card } from '../../components/card.tsx';
import { Star, Calendar, Users, MessageSquare } from 'lucide-solid';
import { Show, For } from 'solid-js';

const formatReleaseDate = (date: string | null | undefined): string => {
  if (!date) return '';
  try {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return date;
  }
};

export default function MovieDetailPage() {
  const params = useParams();
  const movieId = () => params.id || '';

  const result = createQuery(
    graphql(`
      query MovieDetail($id: ID!) {
        movie(id: $id) {
          id
          title
          plot
          releaseDate
          runtime
          rating
          posterUrl
          backdropUrl

          credits {
            __typename

            ... on Cast {
              id
              character

              person {
                id
                name
                imageUrl
              }
            }

            ... on Crew {
              id
              job

              person {
                id
                name
                imageUrl
              }
            }
          }

          genres {
            id
            name
          }

          reviews {
            id
            rating
            text
            createdAt
          }
        }
      }
    `),
    () => ({
      id: movieId(),
    }),
  );

  const movie = () => result.data?.movie;
  const cast = () => movie()?.credits.filter((c) => c.__typename === 'Cast') || [];
  const crew = () => movie()?.credits.filter((c) => c.__typename === 'Crew') || [];
  const directors = () => crew().filter((c) => c.__typename === 'Crew' && c.job === 'Director');

  return (
    <Show
      when={!result.loading || result.data}
      fallback={<p class="text-sm text-neutral-500">Loading movie details...</p>}
    >
      <Show
        when={!result.error}
        fallback={
          <Card class="bg-red-50 border-red-200">
            <div class="space-y-3">
              <h3 class="text-sm font-semibold text-neutral-950">Error</h3>
              <pre class="text-xs text-neutral-700 overflow-x-auto">{JSON.stringify(result.error, null, 2)}</pre>
            </div>
          </Card>
        }
      >
        <Show
          when={movie()}
          fallback={
            <Card class="text-center">
              <p class="text-sm text-neutral-500">Movie not found.</p>
            </Card>
          }
        >
          {(m) => (
            <div class="space-y-8">
              <h1 class="text-3xl font-bold text-neutral-950">{m().title}</h1>

              <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div class="md:col-span-1">
                  <Show when={m().posterUrl}>
                    <img src={m().posterUrl as string} alt={m().title} class="w-full border border-neutral-200" />
                  </Show>
                </div>

                <div class="md:col-span-2 space-y-6">
                  <Card>
                    <div class="space-y-4">
                      <div class="flex items-center flex-wrap gap-3">
                        <Show when={m().rating}>
                          <div class="flex items-center gap-2">
                            <Star class="w-5 h-5 fill-yellow-400 text-yellow-400" />
                            <span class="text-xl font-semibold text-neutral-950">{m().rating!.toFixed(1)}</span>
                          </div>
                        </Show>
                        <Show when={formatReleaseDate(m().releaseDate as string)}>
                          <div class="flex items-center gap-1.5 text-sm text-neutral-500">
                            <Calendar class="w-4 h-4" />
                            <span>{formatReleaseDate(m().releaseDate as string)}</span>
                          </div>
                        </Show>
                        <div class="flex flex-wrap gap-2">
                          <For each={m().genres}>
                            {(genre) => (
                              <span class="inline-flex items-center px-2.5 py-0.5 text-xs font-medium bg-neutral-50 text-neutral-500 border border-neutral-200">
                                {genre.name}
                              </span>
                            )}
                          </For>
                        </div>
                      </div>

                      <Show when={m().plot}>
                        <div class="space-y-2">
                          <h3 class="text-sm font-semibold text-neutral-950">Plot</h3>
                          <p class="text-sm text-neutral-600">{m().plot}</p>
                        </div>
                      </Show>

                      <Show when={directors().length > 0}>
                        <div class="space-y-2">
                          <h3 class="text-sm font-semibold text-neutral-950">Director</h3>
                          <p class="text-sm text-neutral-600">
                            {directors()
                              .map((d) => (d.__typename === 'Crew' ? d.person.name : ''))
                              .join(', ')}
                          </p>
                        </div>
                      </Show>
                    </div>
                  </Card>

                  <Show when={cast().length > 0}>
                    <Card>
                      <div class="space-y-4">
                        <div class="flex items-center gap-2">
                          <Users class="w-4 h-4 text-neutral-950" />
                          <h3 class="text-sm font-semibold text-neutral-950">Cast</h3>
                        </div>
                        <div class="grid grid-cols-2 gap-3">
                          <For each={cast().slice(0, 12)}>
                            {(member) => {
                              if (member.__typename !== 'Cast') return null;
                              return (
                                <div class="flex gap-3 items-center">
                                  <Show when={member.person.imageUrl}>
                                    <img
                                      src={member.person.imageUrl as unknown as string}
                                      alt={member.person.name}
                                      class="w-12 h-12 rounded-full object-cover"
                                    />
                                  </Show>
                                  <div class="flex-1 min-w-0">
                                    <p class="text-sm font-medium text-neutral-950 truncate">{member.person.name}</p>
                                    <p class="text-xs text-neutral-500 truncate">{member.character}</p>
                                  </div>
                                </div>
                              );
                            }}
                          </For>
                        </div>
                      </div>
                    </Card>
                  </Show>

                  <Show when={m().reviews && m().reviews!.length > 0}>
                    <Card>
                      <div class="space-y-4">
                        <div class="flex items-center gap-2">
                          <MessageSquare class="w-4 h-4 text-neutral-950" />
                          <h3 class="text-sm font-semibold text-neutral-950">Reviews ({m().reviews!.length})</h3>
                        </div>
                        <div class="space-y-3">
                          <For each={m().reviews!.slice(0, 5)}>
                            {(review) => (
                              <div class="border-l-2 border-neutral-200 pl-3">
                                <div class="flex items-center gap-2 mb-1">
                                  <div class="flex items-center gap-1">
                                    <Star class="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />
                                    <span class="text-sm font-medium text-neutral-950">{review.rating}</span>
                                  </div>
                                  <span class="text-xs text-neutral-400">
                                    {new Date(review.createdAt as any).toLocaleDateString()}
                                  </span>
                                </div>
                                <Show when={review.text}>
                                  <p class="text-sm text-neutral-600 line-clamp-3">{review.text}</p>
                                </Show>
                              </div>
                            )}
                          </For>
                        </div>
                      </div>
                    </Card>
                  </Show>
                </div>
              </div>
            </div>
          )}
        </Show>
      </Show>
    </Show>
  );
}
