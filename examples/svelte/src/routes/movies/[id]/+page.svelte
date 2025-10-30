<script lang="ts">
	import { createQuery, createMutation } from '@mearie/svelte';
	import { graphql } from '$mearie';
	import { page } from '$app/stores';
	import Card from '$lib/components/Card.svelte';
	import { Star, Calendar, Users, MessageSquare, ThumbsUp, ThumbsDown } from 'lucide-svelte';

	let movieId = $derived($page.params.id);

	const query = createQuery(
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
					likeCount
					dislikeCount

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
			id: movieId!,
		}),
	);

	const [likeMovie] = createMutation(
		graphql(`
			mutation LikeMovie($movieId: ID!) {
				likeMovie(movieId: $movieId) {
					id
					likeCount
					dislikeCount
				}
			}
		`),
	);

	const [dislikeMovie] = createMutation(
		graphql(`
			mutation DislikeMovie($movieId: ID!) {
				dislikeMovie(movieId: $movieId) {
					id
					likeCount
					dislikeCount
				}
			}
		`),
	);

	const movie = $derived(query.data?.movie);
	const cast = $derived(movie?.credits.filter((c) => c.__typename === 'Cast') || []);
	const crew = $derived(movie?.credits.filter((c) => c.__typename === 'Crew') || []);
	const directors = $derived(crew.filter((c) => c.__typename === 'Crew' && c.job === 'Director'));
</script>

{#if query.loading && !query.data}
	<p class="text-sm text-neutral-500">Loading movie details...</p>
{:else if query.error}
	<Card class="bg-red-50 border-red-200">
		<div class="space-y-3">
			<h3 class="text-sm font-semibold text-neutral-950">Error</h3>
			<pre class="text-xs text-neutral-700 overflow-x-auto">{JSON.stringify(query.error, null, 2)}</pre>
		</div>
	</Card>
{:else if !movie}
	<Card class="text-center">
		<p class="text-sm text-neutral-500">Movie not found.</p>
	</Card>
{:else}
	<div class="space-y-8">
		<h1 class="text-3xl font-bold text-neutral-950">{movie.title}</h1>

		<div class="grid grid-cols-1 md:grid-cols-3 gap-8">
			<div class="md:col-span-1">
				{#if movie.posterUrl}
					<img src={movie.posterUrl} alt={movie.title} class="w-full border border-neutral-200" />
				{/if}
			</div>

			<div class="md:col-span-2 space-y-6">
				<Card>
					<div class="space-y-4">
						<div class="flex items-center justify-between">
							<div class="flex items-center flex-wrap gap-3">
								{#if movie.rating}
									<div class="flex items-center gap-2">
										<Star class="w-5 h-5 fill-yellow-400 text-yellow-400" />
										<span class="text-xl font-semibold text-neutral-950">{movie.rating.toFixed(1)}</span>
									</div>
								{/if}
								{#if movie.releaseDate}
									<div class="flex items-center gap-1.5 text-sm text-neutral-500">
										<Calendar class="w-4 h-4" />
										<span>{movie.releaseDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
									</div>
								{/if}
								<div class="flex flex-wrap gap-2">
									{#each movie.genres as genre}
										<span
											class="inline-flex items-center px-2.5 py-0.5 text-xs font-medium bg-neutral-50 text-neutral-500 border border-neutral-200"
										>
											{genre.name}
										</span>
									{/each}
								</div>
							</div>

							<div class="flex items-center gap-0.5 border border-neutral-200 bg-white overflow-hidden">
								<button
									onclick={() => likeMovie({ movieId })}
									class="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors cursor-pointer"
									aria-label="Like movie"
								>
									<ThumbsUp class="w-4 h-4" />
									<span>{movie.likeCount}</span>
								</button>
								<div class="w-px h-6 bg-neutral-200"></div>
								<button
									onclick={() => dislikeMovie({ movieId })}
									class="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors cursor-pointer"
									aria-label="Dislike movie"
								>
									<ThumbsDown class="w-4 h-4" />
									<span>{movie.dislikeCount}</span>
								</button>
							</div>
						</div>

						{#if movie.plot}
							<div class="space-y-2">
								<h3 class="text-sm font-semibold text-neutral-950">Plot</h3>
								<p class="text-sm text-neutral-600">{movie.plot}</p>
							</div>
						{/if}

						{#if directors.length > 0}
							<div class="space-y-2">
								<h3 class="text-sm font-semibold text-neutral-950">Director</h3>
								<p class="text-sm text-neutral-600">
									{directors.map((d: any) => (d.__typename === 'Crew' ? d.person.name : '')).join(', ')}
								</p>
							</div>
						{/if}
					</div>
				</Card>

				{#if cast.length > 0}
					<Card>
						<div class="space-y-4">
							<div class="flex items-center gap-2">
								<Users class="w-4 h-4 text-neutral-950" />
								<h3 class="text-sm font-semibold text-neutral-950">Cast</h3>
							</div>
							<div class="grid grid-cols-2 gap-3">
								{#each cast.slice(0, 12) as member}
									{#if member.__typename === 'Cast'}
										<div class="flex gap-3 items-center">
											{#if member.person.imageUrl}
												<img
													src={member.person.imageUrl}
													alt={member.person.name}
													class="w-12 h-12 rounded-full object-cover"
												/>
											{/if}
											<div class="flex-1 min-w-0">
												<p class="text-sm font-medium text-neutral-950 truncate">{member.person.name}</p>
												<p class="text-xs text-neutral-500 truncate">{member.character}</p>
											</div>
										</div>
									{/if}
								{/each}
							</div>
						</div>
					</Card>
				{/if}

				{#if movie.reviews && movie.reviews.length > 0}
					<Card>
						<div class="space-y-4">
							<div class="flex items-center gap-2">
								<MessageSquare class="w-4 h-4 text-neutral-950" />
								<h3 class="text-sm font-semibold text-neutral-950">Reviews ({movie.reviews.length})</h3>
							</div>
							<div class="space-y-3">
								{#each movie.reviews.slice(0, 5) as review}
									<div class="border-l-2 border-neutral-200 pl-3">
										<div class="flex items-center gap-2 mb-1">
											<div class="flex items-center gap-1">
												<Star class="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />
												<span class="text-sm font-medium text-neutral-950">{review.rating}</span>
											</div>
											<span class="text-xs text-neutral-400">
												{new Date(review.createdAt).toLocaleDateString()}
											</span>
										</div>
										{#if review.text}
											<p class="text-sm text-neutral-600 line-clamp-3">{review.text}</p>
										{/if}
									</div>
								{/each}
							</div>
						</div>
					</Card>
				{/if}
			</div>
		</div>
	</div>
{/if}
