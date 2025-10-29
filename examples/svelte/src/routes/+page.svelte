<script lang="ts">
	import { untrack } from 'svelte';
	import { createQuery, createSubscription, type DataOf } from '@mearie/svelte';
	import { graphql } from '$mearie';
	import type { ReviewUpdates } from '$mearie';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import MovieCard from '$lib/components/MovieCard.svelte';
	import Card from '$lib/components/Card.svelte';
	import Button from '$lib/components/Button.svelte';
	import { Search, RefreshCw, ChevronDown, Radio, Star, Clock } from 'lucide-svelte';

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

	const formatTime = (date: Date) => {
		return new Date(date).toLocaleTimeString('en-US', {
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
		});
	};

	let cursor = $state<string | undefined>(undefined);
	let searchQuery = $state(page.url.searchParams.get('q') ?? '');
	let debouncedQuery = $state(page.url.searchParams.get('q') ?? '');
	let activities = $state<ActivityItem[]>([]);
	let isConnected = $state(true);
	let allMovies = $state<any[]>([]);

	const query = createQuery(
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
			after: cursor,
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
		() => ({ query: debouncedQuery, limit: 20 }),
		() => ({ skip: !debouncedQuery || debouncedQuery.length < 1 }),
	);

	const handleReviewData = (data: DataOf<ReviewUpdates>) => {
		const activity: ActivityItem = {
			id: `review-${data.reviewAdded.id}-${Date.now()}`,
			timestamp: new Date(data.reviewAdded.createdAt as any),
			message: `New review for "${data.reviewAdded.movie.title}"`,
			data: data.reviewAdded,
		};
		activities = [activity, ...activities].slice(0, 10);
		isConnected = true;
	};

	const handleReviewError = (error: Error) => {
		console.error('Review subscription error:', error);
		isConnected = false;
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
		{} as any,
		() => ({
			onData: handleReviewData,
			onError: handleReviewError,
		}),
	);

	$effect(() => {
		if (query.data?.movies.edges) {
			const newEdges = [...query.data.movies.edges];
			const existingIds = new Set(untrack(() => allMovies).map((edge) => edge.node.id));
			const uniqueNewEdges = newEdges.filter((edge) => !existingIds.has(edge.node.id));
			allMovies = [...untrack(() => allMovies), ...uniqueNewEdges];
		}
	});

	const handleLoadMore = () => {
		if (query.data?.movies.pageInfo.endCursor) {
			cursor = query.data.movies.pageInfo.endCursor;
		}
	};

	$effect(() => {
		const urlQuery = page.url.searchParams.get('q') ?? '';
		searchQuery = urlQuery;
		debouncedQuery = urlQuery;
	});

	$effect(() => {
		goto(searchQuery ? `/?q=${encodeURIComponent(searchQuery)}` : '/', {
			replaceState: true,
			noScroll: true,
			keepFocus: true,
		});

		const timeoutId = setTimeout(() => {
			debouncedQuery = searchQuery;
		}, 300);

		return () => clearTimeout(timeoutId);
	});

	const groupedResults = $derived(
		searchResult.data?.search.reduce(
			(acc, result) => {
				if (result.__typename === 'Movie') acc.movies.push(result);
				else if (result.__typename === 'Person') acc.people.push(result);
				return acc;
			},
			{ movies: [] as any[], people: [] as any[] },
		),
	);

	const showingSearch = $derived(debouncedQuery && debouncedQuery.length >= 1);
</script>

<div class="space-y-8">
	<div class="space-y-4">
		<h1 class="text-3xl font-bold text-neutral-950">Mearie Svelte Examples</h1>
		<p class="text-sm text-neutral-600">Movies browser with search, pagination, and real-time updates</p>
	</div>

	<div class="border border-neutral-200 bg-white p-4">
		<div class="relative">
			<Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
			<input
				type="search"
				placeholder="Search for movies or people..."
				bind:value={searchQuery}
				class="w-full pl-10 pr-4 py-2 border border-neutral-300 text-sm"
			/>
		</div>
	</div>

	<div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
		<div class="lg:col-span-2 space-y-8">
			{#if showingSearch}
				<div class="space-y-8">
					<div class="space-y-4">
						<h2 class="text-2xl font-semibold text-neutral-950">Search Results</h2>
						<p class="text-sm text-neutral-600">Showing results for "{debouncedQuery}"</p>
					</div>

					{#if searchResult.error}
						<Card class="bg-red-50 border-red-200">
							<h3 class="text-sm font-semibold text-neutral-950 mb-3">Error</h3>
							<pre class="text-xs text-neutral-700 overflow-x-auto">{JSON.stringify(searchResult.error, null, 2)}</pre>
						</Card>
					{/if}

					{#if searchResult.loading}
						<p class="text-sm text-neutral-500">Searching...</p>
					{/if}

					{#if !searchResult.loading && !searchResult.error && !searchResult.data?.search.length}
						<Card class="text-center">
							<p class="text-sm text-neutral-500">No results found for "{debouncedQuery}".</p>
						</Card>
					{/if}

					{#if groupedResults}
						<div class="space-y-8">
							{#if groupedResults.movies.length > 0}
								<div class="space-y-4">
									<h2 class="text-xl font-semibold text-neutral-950">
										Movies ({groupedResults.movies.length})
									</h2>
									<div class="space-y-2">
										{#each groupedResults.movies as movie}
											<a href={`/movies/${movie.id}`} class="block border border-neutral-200 bg-white p-4">
												<div class="flex gap-4 items-center">
													{#if movie.posterUrl}
														<img src={movie.posterUrl} alt={movie.title} class="w-12 h-18 object-cover" />
													{/if}
													<div class="flex-1 min-w-0">
														<div class="text-sm font-medium text-neutral-950 truncate">{movie.title}</div>
														<div class="text-xs text-neutral-400">{getYearFromDate(movie.releaseDate)}</div>
													</div>
												</div>
											</a>
										{/each}
									</div>
								</div>
							{/if}

							{#if groupedResults.people.length > 0}
								<div class="space-y-4">
									<h2 class="text-xl font-semibold text-neutral-950">
										People ({groupedResults.people.length})
									</h2>
									<div class="space-y-2">
										{#each groupedResults.people as person}
											<div class="border border-neutral-200 bg-white p-4">
												<div class="flex gap-4 items-center">
													{#if person.imageUrl}
														<img
															src={person.imageUrl}
															alt={person.name}
															class="w-12 h-12 rounded-full object-cover"
														/>
													{/if}
													<div class="flex-1 min-w-0">
														<div class="text-sm font-medium text-neutral-950 truncate">{person.name}</div>
													</div>
												</div>
											</div>
										{/each}
									</div>
								</div>
							{/if}
						</div>
					{/if}
				</div>
			{:else}
				<div class="space-y-8">
					{#if query.error}
						<Card class="bg-red-50 border-red-200">
							<div class="space-y-3">
								<h3 class="text-sm font-semibold text-neutral-950">Error</h3>
								<pre class="text-xs text-neutral-700 overflow-x-auto">{JSON.stringify(query.error, null, 2)}</pre>
								<Button onclick={query.refetch}>
									<RefreshCw class="w-3 h-3 mr-1.5" />
									Retry
								</Button>
							</div>
						</Card>
					{/if}

					{#if query.loading && !query.data}
						<p class="text-sm text-neutral-500">Loading movies...</p>
					{/if}

					{#if allMovies.length > 0}
						<div class="space-y-6">
							<div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
								{#each allMovies as { node }}
									<MovieCard movieRef={node} />
								{/each}
							</div>

							{#if query.data?.movies.pageInfo.hasNextPage}
								<div class="flex justify-center">
									<Button onclick={handleLoadMore} disabled={query.loading}>
										<ChevronDown class="w-4 h-4 mr-1.5" />
										{query.loading ? 'Loading...' : 'Load More'}
									</Button>
								</div>
							{/if}

							{#if query.data && !query.data.movies.pageInfo.hasNextPage && allMovies.length > 0}
								<Card class="text-center">
									<p class="text-sm text-neutral-500">No more movies to load</p>
								</Card>
							{/if}
						</div>
					{/if}
				</div>
			{/if}
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
							<div class={`w-1.5 h-1.5 rounded-full mr-1.5 ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
							{isConnected ? 'Connected' : 'Disconnected'}
						</div>
					</div>
					<p class="text-sm text-neutral-500">Real-time reviews via Server-Sent Events</p>
				</div>

				{#if reviewSub.error}
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
				{/if}

				<div class="border border-neutral-200 bg-white">
					<div class="p-4 border-b border-neutral-200">
						<div class="flex justify-between items-center">
							<h3 class="text-sm font-semibold text-neutral-950">Activity Feed</h3>
							<div class="text-neutral-600 inline-flex items-center text-xs font-medium">
								{activities.length}
							</div>
						</div>
					</div>

					<div class="p-4">
						{#if activities.length === 0}
							<div class="text-center py-12">
								<div class="w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center mx-auto mb-3">
									<Star class="w-6 h-6 text-neutral-400" />
								</div>
								<p class="text-sm font-medium text-neutral-950 mb-1">No activity yet</p>
								<p class="text-xs text-neutral-500">New reviews will appear here in real-time</p>
							</div>
						{:else}
							<div class="space-y-2 max-h-[600px] overflow-y-auto">
								{#each activities as activity}
									<a href={`/movies/${activity.data.movie.id}`} class="block border border-neutral-200 bg-white p-3">
										<div class="space-y-2">
											<div class="flex items-start justify-between gap-3">
												<p class="text-sm text-neutral-950 flex-1">{activity.data.movie.title}</p>
												<div class="flex items-center gap-1 flex-shrink-0">
													<Star class="w-3 h-3 text-neutral-950 fill-neutral-950" />
													<span class="text-sm text-neutral-950">{activity.data.rating.toFixed(1)}</span>
												</div>
											</div>
											{#if activity.data.text}
												<p class="text-xs text-neutral-600 line-clamp-2">{activity.data.text}</p>
											{/if}
											<div class="flex items-center gap-1">
												<Clock class="w-3 h-3 text-neutral-400" />
												<p class="text-xs text-neutral-500">{formatTime(activity.timestamp)}</p>
											</div>
										</div>
									</a>
								{/each}
							</div>
						{/if}
					</div>
				</div>
			</div>
		</div>
	</div>
</div>