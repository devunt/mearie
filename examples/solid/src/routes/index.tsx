import { A, useSearchParams } from '@solidjs/router';
import { createQuery, createSubscription, type DataOf } from '@mearie/solid';
import { graphql } from '$mearie';
import type { ReviewUpdates } from '$mearie';
import { createSignal, createEffect, onCleanup, Show, For } from 'solid-js';
import { MovieCard } from '../components/movie-card.tsx';
import { Card } from '../components/card.tsx';
import { Button } from '../components/button.tsx';
import { Search, RefreshCw, ChevronDown, Radio, Star, Clock } from 'lucide-solid';

type ActivityItem = {
  id: string;
  timestamp: Date;
  message: string;
  data: any;
};

const getYearFromDate = (date: string | null | undefined): string => {
  if (!date) return '';
  return date.split('-')[0] || '';
};

export default function HomePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const q = typeof searchParams.q === 'string' ? searchParams.q : '';

  const [cursor, setCursor] = createSignal<string | undefined>(undefined);
  const [searchQuery, setSearchQuery] = createSignal(q);
  const [debouncedQuery, setDebouncedQuery] = createSignal(q);
  const [activities, setActivities] = createSignal<ActivityItem[]>([]);
  const [isConnected, setIsConnected] = createSignal(true);
  const [allMovies, setAllMovies] = createSignal<any[]>([]);

  const moviesResult = createQuery(
    graphql(`
      query Movies($first: Int!, $after: String, $filter: MovieFilterInput) {
        movies(first: $first, after: $after, filter: $filter) {
          edges {
            cursor

            node {
              id
              ...MovieCard
            }
          }

          pageInfo {
            hasNextPage
            hasPreviousPage
            startCursor
            endCursor
          }

          totalCount
        }
      }
    `),
    () => ({
      first: 24,
      after: cursor(),
    }),
  );

  const searchResult = createQuery(
    graphql(`
      query Search($query: String!, $limit: Int) {
        search(query: $query, limit: $limit) {
          __typename

          ... on Movie {
            id
            title
            releaseDate
            posterUrl
          }

          ... on Person {
            id
            name
            imageUrl
          }
        }
      }
    `),
    () => ({ query: debouncedQuery() || '', limit: 20 }),
    () => ({ skip: !debouncedQuery() || debouncedQuery().length < 1 }),
  );

  const handleReviewData = (data: DataOf<ReviewUpdates>) => {
    const activity: ActivityItem = {
      id: `review-${data.reviewAdded.id}-${Date.now()}`,
      timestamp: new Date(data.reviewAdded.createdAt as any),
      message: `New review for "${data.reviewAdded.movie.title}"`,
      data: data.reviewAdded,
    };
    setActivities((prev) => [activity, ...prev].slice(0, 10));
    setIsConnected(true);
  };

  const handleReviewError = (error: Error) => {
    console.error('Review subscription error:', error);
    setIsConnected(false);
  };

  const reviewSub = createSubscription(
    graphql(`
      subscription ReviewUpdates {
        reviewAdded {
          id
          rating
          text
          createdAt

          movie {
            id
            title
          }
        }
      }
    `),
    () => ({} as any),
    () => ({
      onData: handleReviewData,
      onError: handleReviewError,
    }),
  );

  createEffect(() => {
    const data = moviesResult.data;
    if (data?.movies.edges) {
      const newEdges = [...data.movies.edges];

      setAllMovies((prev) => {
        const existingIds = new Set(prev.map((edge) => edge.node.id));
        const uniqueNewEdges = newEdges.filter((edge) => !existingIds.has(edge.node.id));
        return [...prev, ...uniqueNewEdges];
      });
    }
  });

  const handleLoadMore = () => {
    const data = moviesResult.data;
    if (data?.movies.pageInfo.endCursor) {
      setCursor(data.movies.pageInfo.endCursor);
    }
  };

  createEffect(() => {
    const qParam = typeof searchParams.q === 'string' ? searchParams.q : '';
    setSearchQuery(qParam);
    setDebouncedQuery(qParam);
  });

  createEffect(() => {
    const query = searchQuery();
    const timeoutId = setTimeout(() => {
      setDebouncedQuery(query);
    }, 300);
    onCleanup(() => clearTimeout(timeoutId));
  });

  const handleSearch = (value: string) => {
    setSearchQuery(value);
    if (value) {
      setSearchParams({ q: value });
    } else {
      setSearchParams({ q: undefined });
    }
  };

  const formatTime = (date: Date) => {
    return new Date(date).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const groupedResults = () => {
    const data = searchResult.data;
    if (!data?.search) return null;

    return data.search.reduce(
      (acc, result) => {
        if (result.__typename === 'Movie') acc.movies.push(result);
        else if (result.__typename === 'Person') acc.people.push(result);
        return acc;
      },
      { movies: [] as any[], people: [] as any[] },
    );
  };

  const showingSearch = () => debouncedQuery() && debouncedQuery().length >= 1;

  return (
    <div class="space-y-8">
      <div class="space-y-4">
        <h1 class="text-3xl font-bold text-neutral-950">Mearie Solid Examples</h1>
        <p class="text-sm text-neutral-600">Movies browser with search, pagination, and real-time updates</p>
      </div>

      <div class="border border-neutral-200 bg-white p-4">
        <div class="relative">
          <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
          <input
            type="search"
            placeholder="Search for movies or people..."
            value={searchQuery()}
            onInput={(e) => handleSearch(e.currentTarget.value)}
            class="w-full pl-10 pr-4 py-2 border border-neutral-300 text-sm"
          />
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div class="lg:col-span-2 space-y-8">
          <Show
            when={showingSearch()}
            fallback={
              <div class="space-y-8">
                <Show when={moviesResult.error}>
                  <Card class="bg-red-50 border-red-200">
                    <div class="space-y-3">
                      <h3 class="text-sm font-semibold text-neutral-950">Error</h3>
                      <pre class="text-xs text-neutral-700 overflow-x-auto">
                        {JSON.stringify(moviesResult.error, null, 2)}
                      </pre>
                      <Button onClick={moviesResult.refetch}>
                        <RefreshCw class="w-3 h-3 mr-1.5" />
                        Retry
                      </Button>
                    </div>
                  </Card>
                </Show>

                <Show when={moviesResult.loading && !moviesResult.data}>
                  <p class="text-sm text-neutral-500">Loading movies...</p>
                </Show>

                <Show when={allMovies().length > 0}>
                  <div class="space-y-6">
                    <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                      <For each={allMovies()}>{(edge) => <MovieCard $movie={edge.node} />}</For>
                    </div>

                    <Show when={moviesResult.data?.movies.pageInfo.hasNextPage}>
                      <div class="flex justify-center">
                        <Button onClick={handleLoadMore} disabled={moviesResult.loading}>
                          <ChevronDown class="w-4 h-4 mr-1.5" />
                          {moviesResult.loading ? 'Loading...' : 'Load More'}
                        </Button>
                      </div>
                    </Show>

                    <Show
                      when={moviesResult.data && !moviesResult.data.movies.pageInfo.hasNextPage && allMovies().length > 0}
                    >
                      <Card class="text-center">
                        <p class="text-sm text-neutral-500">No more movies to load</p>
                      </Card>
                    </Show>
                  </div>
                </Show>
              </div>
            }
          >
            <div class="space-y-8">
              <div class="space-y-4">
                <h2 class="text-2xl font-semibold text-neutral-950">Search Results</h2>
                <p class="text-sm text-neutral-600">Showing results for "{debouncedQuery()}"</p>
              </div>

              <Show when={searchResult.error}>
                <Card class="bg-red-50 border-red-200">
                  <h3 class="text-sm font-semibold text-neutral-950 mb-3">Error</h3>
                  <pre class="text-xs text-neutral-700 overflow-x-auto">
                    {JSON.stringify(searchResult.error, null, 2)}
                  </pre>
                </Card>
              </Show>

              <Show when={searchResult.loading}>
                <p class="text-sm text-neutral-500">Searching...</p>
              </Show>

              <Show when={!searchResult.loading && !searchResult.error && !searchResult.data?.search.length}>
                <Card class="text-center">
                  <p class="text-sm text-neutral-500">No results found for "{debouncedQuery()}".</p>
                </Card>
              </Show>

              <Show when={groupedResults()}>
                {(results) => (
                  <div class="space-y-8">
                    <Show when={results().movies.length > 0}>
                      <div class="space-y-4">
                        <h2 class="text-xl font-semibold text-neutral-950">Movies ({results().movies.length})</h2>
                        <div class="space-y-2">
                          <For each={results().movies}>
                            {(movie) => (
                              <A href={`/movies/${movie.id}`} class="block border border-neutral-200 bg-white p-4">
                                <div class="flex gap-4 items-center">
                                  <Show when={movie.posterUrl}>
                                    <img src={movie.posterUrl!} alt={movie.title} class="w-12 h-18 object-cover" />
                                  </Show>
                                  <div class="flex-1 min-w-0">
                                    <div class="text-sm font-medium text-neutral-950 truncate">{movie.title}</div>
                                    <div class="text-xs text-neutral-400">{getYearFromDate(movie.releaseDate)}</div>
                                  </div>
                                </div>
                              </A>
                            )}
                          </For>
                        </div>
                      </div>
                    </Show>

                    <Show when={results().people.length > 0}>
                      <div class="space-y-4">
                        <h2 class="text-xl font-semibold text-neutral-950">People ({results().people.length})</h2>
                        <div class="space-y-2">
                          <For each={results().people}>
                            {(person) => (
                              <div class="border border-neutral-200 bg-white p-4">
                                <div class="flex gap-4 items-center">
                                  <Show when={person.imageUrl}>
                                    <img
                                      src={person.imageUrl!}
                                      alt={person.name}
                                      class="w-12 h-12 rounded-full object-cover"
                                    />
                                  </Show>
                                  <div class="flex-1 min-w-0">
                                    <div class="text-sm font-medium text-neutral-950 truncate">{person.name}</div>
                                  </div>
                                </div>
                              </div>
                            )}
                          </For>
                        </div>
                      </div>
                    </Show>
                  </div>
                )}
              </Show>
            </div>
          </Show>
        </div>

        <div class="lg:col-span-1">
          <div class="space-y-6 lg:sticky lg:top-8">
            <div class="border border-neutral-200 bg-white p-6 space-y-4">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2.5">
                  <Radio class="w-5 h-5 text-neutral-950" />
                  <h2 class="text-lg font-semibold text-neutral-950">Live Updates</h2>
                </div>
                <div class="text-neutral-600 inline-flex items-center text-xs font-medium">
                  <div
                    class={`w-1.5 h-1.5 rounded-full mr-1.5 ${isConnected() ? 'bg-green-500' : 'bg-red-500'}`}
                  />
                  {isConnected() ? 'Connected' : 'Disconnected'}
                </div>
              </div>
              <p class="text-sm text-neutral-500">Real-time reviews via Server-Sent Events</p>
            </div>

            <Show when={reviewSub.error}>
              <div class="border border-red-200 bg-red-50 p-4">
                <div class="flex items-start gap-3">
                  <div class="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span class="text-red-600 text-xs font-bold">!</span>
                  </div>
                  <div class="flex-1 space-y-2">
                    <h3 class="text-sm font-semibold text-red-900">Subscription Error</h3>
                    <pre class="text-xs text-red-700 overflow-x-auto">{JSON.stringify(reviewSub.error, null, 2)}</pre>
                  </div>
                </div>
              </div>
            </Show>

            <div class="border border-neutral-200 bg-white">
              <div class="p-4 border-b border-neutral-200">
                <div class="flex justify-between items-center">
                  <h3 class="text-sm font-semibold text-neutral-950">Activity Feed</h3>
                  <div class="text-neutral-600 inline-flex items-center text-xs font-medium">{activities().length}</div>
                </div>
              </div>

              <div class="p-4">
                <Show
                  when={activities().length > 0}
                  fallback={
                    <div class="text-center py-12">
                      <div class="w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center mx-auto mb-3">
                        <Star class="w-6 h-6 text-neutral-400" />
                      </div>
                      <p class="text-sm font-medium text-neutral-950 mb-1">No activity yet</p>
                      <p class="text-xs text-neutral-500">New reviews will appear here in real-time</p>
                    </div>
                  }
                >
                  <div class="space-y-2 max-h-[600px] overflow-y-auto">
                    <For each={activities()}>
                      {(activity) => (
                        <A href={`/movies/${activity.data.movie.id}`} class="block border border-neutral-200 bg-white p-3">
                          <div class="space-y-2">
                            <div class="flex items-start justify-between gap-3">
                              <p class="text-sm text-neutral-950 flex-1">{activity.data.movie.title}</p>
                              <div class="flex items-center gap-1 flex-shrink-0">
                                <Star class="w-3 h-3 text-neutral-950 fill-neutral-950" />
                                <span class="text-sm text-neutral-950">{activity.data.rating.toFixed(1)}</span>
                              </div>
                            </div>
                            <Show when={activity.data.text}>
                              <p class="text-xs text-neutral-600 line-clamp-2">{activity.data.text}</p>
                            </Show>
                            <div class="flex items-center gap-1">
                              <Clock class="w-3 h-3 text-neutral-400" />
                              <p class="text-xs text-neutral-500">{formatTime(activity.timestamp)}</p>
                            </div>
                          </div>
                        </A>
                      )}
                    </For>
                  </div>
                </Show>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
