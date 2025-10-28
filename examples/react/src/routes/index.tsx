import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery, useSubscription, type DataOf } from '@mearie/react';
import { graphql } from '$mearie';
import type { ReviewUpdates } from '$mearie';
import { useState, useCallback, useEffect } from 'react';
import { MovieCard } from '../components/movie-card.tsx';
import { Card } from '../components/card.tsx';
import { Button } from '../components/button.tsx';
import { Search, RefreshCw, ChevronDown, Radio, Star, Clock } from 'lucide-react';

export const Route = createFileRoute('/')({
  component: HomePage,
  validateSearch: (search: Record<string, unknown>) => {
    const q = (search.q as string) || '';
    return q ? { q } : {};
  },
});

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

function HomePage() {
  const navigate = Route.useNavigate();
  const search = Route.useSearch();
  const q = 'q' in search ? search.q : '';
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState(q);
  const [debouncedQuery, setDebouncedQuery] = useState(q);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [isConnected, setIsConnected] = useState(true);
  const [allMovies, setAllMovies] = useState<any[]>([]);

  const moviesResult = useQuery(
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
    {
      first: 24,
      after: cursor,
    },
  );

  const searchResult = useQuery(
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
    { query: debouncedQuery, limit: 20 },
    { skip: !debouncedQuery || debouncedQuery.length < 1 },
  );

  const handleReviewData = useCallback((data: DataOf<ReviewUpdates>) => {
    const activity: ActivityItem = {
      id: `review-${data.reviewAdded.id}-${Date.now()}`,
      timestamp: new Date(data.reviewAdded.createdAt as any),
      message: `New review for "${data.reviewAdded.movie.title}"`,
      data: data.reviewAdded,
    };
    setActivities((prev) => [activity, ...prev].slice(0, 10));
    setIsConnected(true);
  }, []);

  const handleReviewError = useCallback((error: Error) => {
    console.error('Review subscription error:', error);
    setIsConnected(false);
  }, []);

  const reviewSub = useSubscription(
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
    {} as any,
    {
      onData: handleReviewData,
      onError: handleReviewError,
    },
  );

  useEffect(() => {
    if (moviesResult.data?.movies.edges) {
      const newEdges = [...moviesResult.data.movies.edges];

      setAllMovies((prev) => {
        const existingIds = new Set(prev.map((edge) => edge.node.id));
        const uniqueNewEdges = newEdges.filter((edge) => !existingIds.has(edge.node.id));
        return [...prev, ...uniqueNewEdges];
      });
    }
  }, [moviesResult.data]);

  const handleLoadMore = () => {
    if (moviesResult.data?.movies.pageInfo.endCursor) {
      setCursor(moviesResult.data.movies.pageInfo.endCursor);
    }
  };

  useEffect(() => {
    setSearchQuery(q);
    setDebouncedQuery(q);
  }, [q]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  const handleSearch = (value: string) => {
    setSearchQuery(value);
    navigate({ search: value ? { q: value } : {} });
  };

  const formatTime = (date: Date) => {
    return new Date(date).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const groupedResults = searchResult.data?.search.reduce(
    (acc, result) => {
      if (result.__typename === 'Movie') acc.movies.push(result);
      else if (result.__typename === 'Person') acc.people.push(result);
      return acc;
    },
    { movies: [] as any[], people: [] as any[] },
  );

  const showingSearch = debouncedQuery && debouncedQuery.length >= 1;

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <h1 className="text-3xl font-bold text-neutral-950">Mearie React Examples</h1>
        <p className="text-sm text-neutral-600">Movies browser with search, pagination, and real-time updates</p>
      </div>

      <div className="border border-neutral-200 bg-white p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
          <input
            type="search"
            placeholder="Search for movies or people..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-neutral-300 text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          {showingSearch ? (
            <div className="space-y-8">
              <div className="space-y-4">
                <h2 className="text-2xl font-semibold text-neutral-950">Search Results</h2>
                <p className="text-sm text-neutral-600">Showing results for "{debouncedQuery}"</p>
              </div>

              {searchResult.error && (
                <Card className="bg-red-50 border-red-200">
                  <h3 className="text-sm font-semibold text-neutral-950 mb-3">Error</h3>
                  <pre className="text-xs text-neutral-700 overflow-x-auto">
                    {JSON.stringify(searchResult.error, null, 2)}
                  </pre>
                </Card>
              )}

              {searchResult.loading && <p className="text-sm text-neutral-500">Searching...</p>}

              {!searchResult.loading && !searchResult.error && !searchResult.data?.search.length && (
                <Card className="text-center">
                  <p className="text-sm text-neutral-500">No results found for "{debouncedQuery}".</p>
                </Card>
              )}

              {groupedResults && (
                <div className="space-y-8">
                  {groupedResults.movies.length > 0 && (
                    <div className="space-y-4">
                      <h2 className="text-xl font-semibold text-neutral-950">
                        Movies ({groupedResults.movies.length})
                      </h2>
                      <div className="space-y-2">
                        {groupedResults.movies.map((movie) => (
                          <Link
                            key={movie.id}
                            to="/movies/$movieId"
                            params={{ movieId: movie.id }}
                            className="block border border-neutral-200 bg-white p-4"
                          >
                            <div className="flex gap-4 items-center">
                              {movie.posterUrl && (
                                <img src={movie.posterUrl} alt={movie.title} className="w-12 h-18 object-cover" />
                              )}
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-neutral-950 truncate">{movie.title}</div>
                                <div className="text-xs text-neutral-400">{getYearFromDate(movie.releaseDate)}</div>
                              </div>
                            </div>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}

                  {groupedResults.people.length > 0 && (
                    <div className="space-y-4">
                      <h2 className="text-xl font-semibold text-neutral-950">
                        People ({groupedResults.people.length})
                      </h2>
                      <div className="space-y-2">
                        {groupedResults.people.map((person) => (
                          <div key={person.id} className="border border-neutral-200 bg-white p-4">
                            <div className="flex gap-4 items-center">
                              {person.imageUrl && (
                                <img
                                  src={person.imageUrl}
                                  alt={person.name}
                                  className="w-12 h-12 rounded-full object-cover"
                                />
                              )}
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-neutral-950 truncate">{person.name}</div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-8">
              {moviesResult.error && (
                <Card className="bg-red-50 border-red-200">
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-neutral-950">Error</h3>
                    <pre className="text-xs text-neutral-700 overflow-x-auto">
                      {JSON.stringify(moviesResult.error, null, 2)}
                    </pre>
                    <Button onClick={moviesResult.refetch}>
                      <RefreshCw className="w-3 h-3 mr-1.5" />
                      Retry
                    </Button>
                  </div>
                </Card>
              )}

              {moviesResult.loading && !moviesResult.data && (
                <p className="text-sm text-neutral-500">Loading movies...</p>
              )}

              {allMovies.length > 0 && (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                    {allMovies.map(({ node }) => (
                      <MovieCard key={node.id} $movie={node} />
                    ))}
                  </div>

                  {moviesResult.data?.movies.pageInfo.hasNextPage && (
                    <div className="flex justify-center">
                      <Button onClick={handleLoadMore} disabled={moviesResult.loading}>
                        <ChevronDown className="w-4 h-4 mr-1.5" />
                        {moviesResult.loading ? 'Loading...' : 'Load More'}
                      </Button>
                    </div>
                  )}

                  {moviesResult.data && !moviesResult.data.movies.pageInfo.hasNextPage && allMovies.length > 0 && (
                    <Card className="text-center">
                      <p className="text-sm text-neutral-500">No more movies to load</p>
                    </Card>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="lg:col-span-1">
          <div className="space-y-6 lg:sticky lg:top-8">
            <div className="border border-neutral-200 bg-white p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Radio className="w-5 h-5 text-neutral-950" />
                  <h2 className="text-lg font-semibold text-neutral-950">Live Updates</h2>
                </div>
                <div className="text-neutral-600 inline-flex items-center text-xs font-medium">
                  <div className={`w-1.5 h-1.5 rounded-full mr-1.5 ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
                  {isConnected ? 'Connected' : 'Disconnected'}
                </div>
              </div>
              <p className="text-sm text-neutral-500">Real-time reviews via Server-Sent Events</p>
            </div>

            {reviewSub.error && (
              <div className="border border-red-200 bg-red-50 p-4">
                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-red-600 text-xs font-bold">!</span>
                  </div>
                  <div className="flex-1 space-y-2">
                    <h3 className="text-sm font-semibold text-red-900">Subscription Error</h3>
                    <pre className="text-xs text-red-700 overflow-x-auto">
                      {JSON.stringify(reviewSub.error, null, 2)}
                    </pre>
                  </div>
                </div>
              </div>
            )}

            <div className="border border-neutral-200 bg-white">
              <div className="p-4 border-b border-neutral-200">
                <div className="flex justify-between items-center">
                  <h3 className="text-sm font-semibold text-neutral-950">Activity Feed</h3>
                  <div className="text-neutral-600 inline-flex items-center text-xs font-medium">
                    {activities.length}
                  </div>
                </div>
              </div>

              <div className="p-4">
                {activities.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center mx-auto mb-3">
                      <Star className="w-6 h-6 text-neutral-400" />
                    </div>
                    <p className="text-sm font-medium text-neutral-950 mb-1">No activity yet</p>
                    <p className="text-xs text-neutral-500">New reviews will appear here in real-time</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[600px] overflow-y-auto">
                    {activities.map((activity) => (
                      <Link
                        key={activity.id}
                        to="/movies/$movieId"
                        params={{ movieId: activity.data.movie.id }}
                        className="block border border-neutral-200 bg-white p-3"
                      >
                        <div className="space-y-2">
                          <div className="flex items-start justify-between gap-3">
                            <p className="text-sm text-neutral-950 flex-1">{activity.data.movie.title}</p>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <Star className="w-3 h-3 text-neutral-950 fill-neutral-950" />
                              <span className="text-sm text-neutral-950">{activity.data.rating.toFixed(1)}</span>
                            </div>
                          </div>
                          {activity.data.text && (
                            <p className="text-xs text-neutral-600 line-clamp-2">{activity.data.text}</p>
                          )}
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3 text-neutral-400" />
                            <p className="text-xs text-neutral-500">{formatTime(activity.timestamp)}</p>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
