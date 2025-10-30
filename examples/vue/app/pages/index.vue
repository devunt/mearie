<script setup lang="ts">
import { useQuery, useSubscription, type DataOf } from '@mearie/vue';
import { graphql } from '$mearie';
import type { ReviewUpdates, Movies, Search } from '$mearie';
import { ref, computed, watch } from 'vue';
import MovieCard from '~/components/MovieCard.vue';
import Card from '~/components/Card.vue';
import Button from '~/components/Button.vue';
import { Search as SearchIcon, RefreshCw, ChevronDown, Radio, Star, Clock } from 'lucide-vue-next';

type ActivityItem = {
  id: string;
  timestamp: Date;
  message: string;
  data: DataOf<ReviewUpdates>['reviewAdded'];
};

const route = useRoute();
const router = useRouter();
const q = computed(() => (route.query.q as string) || '');
const cursor = ref<string | undefined>(undefined);
const searchQuery = ref(q.value);
const debouncedQuery = ref(q.value);
const activities = ref<ActivityItem[]>([]);
const isConnected = ref(true);
const allMovies = ref<DataOf<Movies>['movies']['edges']>([]);

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
  () => ({
    first: 24,
    after: cursor.value,
  }),
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
  () => ({ query: debouncedQuery.value, limit: 20 }),
  () => ({ skip: !debouncedQuery.value || debouncedQuery.value.length < 1 }),
);

const handleReviewData = (data: DataOf<ReviewUpdates>) => {
  const activity: ActivityItem = {
    id: `review-${data.reviewAdded.id}-${Date.now()}`,
    timestamp: data.reviewAdded.createdAt,
    message: `New review for "${data.reviewAdded.movie.title}"`,
    data: data.reviewAdded,
  };
  activities.value = [activity, ...activities.value].slice(0, 10);
  isConnected.value = true;
};

const handleReviewError = (error: Error) => {
  console.error('Review subscription error:', error);
  isConnected.value = false;
};

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
  undefined,
  () => ({
    onData: handleReviewData,
    onError: handleReviewError,
  }),
);

watch(
  () => moviesResult.data.value?.movies.edges,
  (newEdges) => {
    if (newEdges) {
      const edges = [...newEdges];
      const existingIds = new Set(allMovies.value.map((edge) => edge.node.id));
      const uniqueNewEdges = edges.filter((edge) => !existingIds.has(edge.node.id));
      allMovies.value = [...allMovies.value, ...uniqueNewEdges];
    }
  },
);

const handleLoadMore = () => {
  if (moviesResult.data.value?.movies.pageInfo.endCursor) {
    cursor.value = moviesResult.data.value.movies.pageInfo.endCursor;
  }
};

watch(q, (newQ) => {
  searchQuery.value = newQ;
  debouncedQuery.value = newQ;
});

watch(
  searchQuery,
  (newQuery) => {
    const timeoutId = setTimeout(() => {
      debouncedQuery.value = newQuery;
    }, 300);
    return () => clearTimeout(timeoutId);
  },
  { immediate: false },
);

const handleSearch = (value: string) => {
  searchQuery.value = value;
  router.push({ query: value ? { q: value } : {} });
};

const formatTime = (date: Date) => {
  return new Date(date).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

const groupedResults = computed(() => {
  if (!searchResult.data.value?.search) return null;
  return searchResult.data.value.search.reduce<{
    movies: Extract<DataOf<Search>['search'][number], { __typename: 'Movie' }>[];
    people: Extract<DataOf<Search>['search'][number], { __typename: 'Person' }>[];
  }>(
    (acc, result) => {
      if (result.__typename === 'Movie') acc.movies.push(result);
      else if (result.__typename === 'Person') acc.people.push(result);
      return acc;
    },
    { movies: [], people: [] },
  );
});

const showingSearch = computed(() => debouncedQuery.value && debouncedQuery.value.length >= 1);
</script>

<template>
  <div class="space-y-8">
    <div class="space-y-4">
      <h1 class="text-3xl font-bold text-neutral-950">Mearie Vue Examples</h1>
      <p class="text-sm text-neutral-600">Movies browser with search, pagination, and real-time updates</p>
    </div>

    <div class="border border-neutral-200 bg-white p-4">
      <div class="relative">
        <SearchIcon class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
        <input
          type="search"
          placeholder="Search for movies or people..."
          :value="searchQuery"
          @input="handleSearch(($event.target as HTMLInputElement).value)"
          class="w-full pl-10 pr-4 py-2 border border-neutral-300 text-sm"
        />
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div class="lg:col-span-2 space-y-8">
        <div v-if="showingSearch" class="space-y-8">
          <div class="space-y-4">
            <h2 class="text-2xl font-semibold text-neutral-950">Search Results</h2>
            <p class="text-sm text-neutral-600">Showing results for "{{ debouncedQuery }}"</p>
          </div>

          <Card v-if="searchResult.error.value" class="bg-red-50 border-red-200">
            <h3 class="text-sm font-semibold text-neutral-950 mb-3">Error</h3>
            <pre class="text-xs text-neutral-700 overflow-x-auto">{{
              JSON.stringify(searchResult.error.value, null, 2)
            }}</pre>
          </Card>

          <p v-if="searchResult.loading.value" class="text-sm text-neutral-500">Searching...</p>

          <Card
            v-if="!searchResult.loading.value && !searchResult.error.value && !searchResult.data.value?.search.length"
            class="text-center"
          >
            <p class="text-sm text-neutral-500">No results found for "{{ debouncedQuery }}".</p>
          </Card>

          <div v-if="groupedResults" class="space-y-8">
            <div v-if="groupedResults.movies.length > 0" class="space-y-4">
              <h2 class="text-xl font-semibold text-neutral-950">Movies ({{ groupedResults.movies.length }})</h2>
              <div class="space-y-2">
                <NuxtLink
                  v-for="movie in groupedResults.movies"
                  :key="movie.id"
                  :to="`/movies/${movie.id}`"
                  class="block border border-neutral-200 bg-white p-4"
                >
                  <div class="flex gap-4 items-center">
                    <img
                      v-if="movie.posterUrl"
                      :src="movie.posterUrl"
                      :alt="movie.title"
                      class="w-12 h-18 object-cover"
                    />
                    <div class="flex-1 min-w-0">
                      <div class="text-sm font-medium text-neutral-950 truncate">{{ movie.title }}</div>
                      <div class="text-xs text-neutral-400">{{ movie.releaseDate?.getFullYear() ?? '' }}</div>
                    </div>
                  </div>
                </NuxtLink>
              </div>
            </div>

            <div v-if="groupedResults.people.length > 0" class="space-y-4">
              <h2 class="text-xl font-semibold text-neutral-950">People ({{ groupedResults.people.length }})</h2>
              <div class="space-y-2">
                <div
                  v-for="person in groupedResults.people"
                  :key="person.id"
                  class="border border-neutral-200 bg-white p-4"
                >
                  <div class="flex gap-4 items-center">
                    <img
                      v-if="person.imageUrl"
                      :src="person.imageUrl"
                      :alt="person.name"
                      class="w-12 h-12 rounded-full object-cover"
                    />
                    <div class="flex-1 min-w-0">
                      <div class="text-sm font-medium text-neutral-950 truncate">{{ person.name }}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-else class="space-y-8">
          <Card v-if="moviesResult.error.value" class="bg-red-50 border-red-200">
            <div class="space-y-3">
              <h3 class="text-sm font-semibold text-neutral-950">Error</h3>
              <pre class="text-xs text-neutral-700 overflow-x-auto">{{
                JSON.stringify(moviesResult.error.value, null, 2)
              }}</pre>
              <Button @click="moviesResult.refetch()">
                <RefreshCw class="w-3 h-3 mr-1.5" />
                Retry
              </Button>
            </div>
          </Card>

          <p v-if="moviesResult.loading.value && !moviesResult.data.value" class="text-sm text-neutral-500">
            Loading movies...
          </p>

          <div v-if="allMovies.length > 0" class="space-y-6">
            <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              <MovieCard v-for="{ node } in allMovies" :key="node.id" :movie-ref="node" />
            </div>

            <div v-if="moviesResult.data.value?.movies.pageInfo.hasNextPage" class="flex justify-center">
              <Button @click="handleLoadMore" :disabled="moviesResult.loading.value">
                <ChevronDown class="w-4 h-4 mr-1.5" />
                {{ moviesResult.loading.value ? 'Loading...' : 'Load More' }}
              </Button>
            </div>

            <Card
              v-if="
                moviesResult.data.value && !moviesResult.data.value.movies.pageInfo.hasNextPage && allMovies.length > 0
              "
              class="text-center"
            >
              <p class="text-sm text-neutral-500">No more movies to load</p>
            </Card>
          </div>
        </div>
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
                <div :class="`w-1.5 h-1.5 rounded-full mr-1.5 ${isConnected ? 'bg-green-500' : 'bg-red-500'}`" />
                {{ isConnected ? 'Connected' : 'Disconnected' }}
              </div>
            </div>
            <p class="text-sm text-neutral-500">Real-time reviews via Server-Sent Events</p>
          </div>

          <div v-if="reviewSub.error.value" class="border border-red-200 bg-red-50 p-4">
            <div class="flex items-start gap-3">
              <div class="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span class="text-red-600 text-xs font-bold">!</span>
              </div>
              <div class="flex-1 space-y-2">
                <h3 class="text-sm font-semibold text-red-900">Subscription Error</h3>
                <pre class="text-xs text-red-700 overflow-x-auto">{{
                  JSON.stringify(reviewSub.error.value, null, 2)
                }}</pre>
              </div>
            </div>
          </div>

          <div class="border border-neutral-200 bg-white">
            <div class="p-4 border-b border-neutral-200">
              <div class="flex justify-between items-center">
                <h3 class="text-sm font-semibold text-neutral-950">Activity Feed</h3>
                <div class="text-neutral-600 inline-flex items-center text-xs font-medium">
                  {{ activities.length }}
                </div>
              </div>
            </div>

            <div class="p-4">
              <div v-if="activities.length === 0" class="text-center py-12">
                <div class="w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center mx-auto mb-3">
                  <Star class="w-6 h-6 text-neutral-400" />
                </div>
                <p class="text-sm font-medium text-neutral-950 mb-1">No activity yet</p>
                <p class="text-xs text-neutral-500">New reviews will appear here in real-time</p>
              </div>
              <div v-else class="space-y-2 max-h-[600px] overflow-y-auto">
                <NuxtLink
                  v-for="activity in activities"
                  :key="activity.id"
                  :to="`/movies/${activity.data.movie.id}`"
                  class="block border border-neutral-200 bg-white p-3"
                >
                  <div class="space-y-2">
                    <div class="flex items-start justify-between gap-3">
                      <p class="text-sm text-neutral-950 flex-1">{{ activity.data.movie.title }}</p>
                      <div class="flex items-center gap-1 flex-shrink-0">
                        <Star class="w-3 h-3 text-neutral-950 fill-neutral-950" />
                        <span class="text-sm text-neutral-950">{{ activity.data.rating.toFixed(1) }}</span>
                      </div>
                    </div>
                    <p v-if="activity.data.text" class="text-xs text-neutral-600 line-clamp-2">
                      {{ activity.data.text }}
                    </p>
                    <div class="flex items-center gap-1">
                      <Clock class="w-3 h-3 text-neutral-400" />
                      <p class="text-xs text-neutral-500">{{ formatTime(activity.timestamp) }}</p>
                    </div>
                  </div>
                </NuxtLink>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
