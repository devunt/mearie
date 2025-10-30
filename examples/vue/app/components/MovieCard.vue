<script setup lang="ts">
import { useFragment } from '@mearie/vue';
import { graphql } from '$mearie';
import type { MovieCard$key } from '$mearie';
import { Star } from 'lucide-vue-next';
import { computed } from 'vue';

interface MovieCardProps {
  movieRef: MovieCard$key;
}

const props = defineProps<MovieCardProps>();

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
  () => props.movieRef,
);

const year = computed(() => movie.data.releaseDate?.getFullYear() ?? '');
const genres = computed(() => movie.data.genres.map((g) => g.name).join(', '));
const castMembers = computed(() =>
  movie.data.credits
    .filter((c) => c.__typename === 'Cast')
    .slice(0, 3)
    .map((c) => c.person.name)
    .join(', '),
);
</script>

<template>
  <NuxtLink
    :to="`/movies/${movie.data.id}`"
    class="block border border-neutral-200 bg-white overflow-hidden"
  >
    <img
      v-if="movie.data.posterUrl"
      :src="movie.data.posterUrl"
      :alt="movie.data.title"
      class="w-full aspect-[2/3] object-cover"
    />

    <div class="p-4 space-y-1.5">
      <div class="flex items-center justify-between gap-1.5">
        <h3 class="text-sm font-semibold text-neutral-950 line-clamp-1 flex-1">{{ movie.data.title }}</h3>
        <div v-if="movie.data.rating" class="flex items-center gap-0.5 flex-shrink-0">
          <Star class="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />
          <span class="text-sm text-neutral-950 font-semibold">{{ movie.data.rating.toFixed(1) }}</span>
        </div>
      </div>

      <p v-if="castMembers" class="text-xs text-neutral-500 line-clamp-1">
        {{ castMembers }}
      </p>

      <p class="flex items-center text-xs text-neutral-400 line-clamp-1">
        <span v-if="year">{{ year }}</span>
        <span v-if="year && genres" class="w-0.5 h-0.5 rounded-full bg-neutral-400 mx-1 flex-shrink-0" />
        <span v-if="genres" class="truncate">{{ genres }}</span>
      </p>
    </div>
  </NuxtLink>
</template>
