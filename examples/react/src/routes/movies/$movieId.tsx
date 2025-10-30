import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation } from '@mearie/react';
import { graphql } from '$mearie';
import { Card } from '../../components/card.tsx';
import { Star, Calendar, Users, MessageSquare, ThumbsUp, ThumbsDown } from 'lucide-react';

export const Route = createFileRoute('/movies/$movieId')({
  component: MovieDetailPage,
});

function MovieDetailPage() {
  const { movieId } = Route.useParams();

  const { data, loading, error } = useQuery(
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
    {
      id: movieId,
    },
  );

  const [likeMovie] = useMutation(
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

  const [dislikeMovie] = useMutation(
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

  if (loading && !data) {
    return <p className="text-sm text-neutral-500">Loading movie details...</p>;
  }

  if (error) {
    return (
      <Card className="bg-red-50 border-red-200">
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-neutral-950">Error</h3>
          <pre className="text-xs text-neutral-700 overflow-x-auto">{JSON.stringify(error, null, 2)}</pre>
        </div>
      </Card>
    );
  }

  if (!data?.movie) {
    return (
      <Card className="text-center">
        <p className="text-sm text-neutral-500">Movie not found.</p>
      </Card>
    );
  }

  const movie = data.movie;
  const cast = movie.credits.filter((c) => c.__typename === 'Cast');
  const crew = movie.credits.filter((c) => c.__typename === 'Crew');
  const directors = crew.filter((c) => c.__typename === 'Crew' && c.job === 'Director');

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold text-neutral-950">{movie.title}</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-1">
          {movie.posterUrl && (
            <img src={movie.posterUrl} alt={movie.title} className="w-full border border-neutral-200" />
          )}
        </div>

        <div className="md:col-span-2 space-y-6">
          <Card>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center flex-wrap gap-3">
                  {movie.rating && (
                    <div className="flex items-center gap-2">
                      <Star className="w-5 h-5 fill-yellow-400 text-yellow-400" />
                      <span className="text-xl font-semibold text-neutral-950">{movie.rating.toFixed(1)}</span>
                    </div>
                  )}
                  {movie.releaseDate && (
                    <div className="flex items-center gap-1.5 text-sm text-neutral-500">
                      <Calendar className="w-4 h-4" />
                      <span>
                        {movie.releaseDate.toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })}
                      </span>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {movie.genres.map((genre) => (
                      <span
                        key={genre.id}
                        className="inline-flex items-center px-2.5 py-0.5 text-xs font-medium bg-neutral-50 text-neutral-500 border border-neutral-200"
                      >
                        {genre.name}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-0.5 border border-neutral-200 bg-white overflow-hidden">
                  <button
                    onClick={() => likeMovie({ movieId })}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors cursor-pointer"
                    aria-label="Like movie"
                  >
                    <ThumbsUp className="w-4 h-4" />
                    <span>{movie.likeCount}</span>
                  </button>
                  <div className="w-px h-6 bg-neutral-200" />
                  <button
                    onClick={() => dislikeMovie({ movieId })}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors cursor-pointer"
                    aria-label="Dislike movie"
                  >
                    <ThumbsDown className="w-4 h-4" />
                    <span>{movie.dislikeCount}</span>
                  </button>
                </div>
              </div>

              {movie.plot && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-neutral-950">Plot</h3>
                  <p className="text-sm text-neutral-600">{movie.plot}</p>
                </div>
              )}

              {directors.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-neutral-950">Director</h3>
                  <p className="text-sm text-neutral-600">
                    {directors.map((d) => (d.__typename === 'Crew' ? d.person.name : '')).join(', ')}
                  </p>
                </div>
              )}
            </div>
          </Card>

          {cast.length > 0 && (
            <Card>
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-neutral-950" />
                  <h3 className="text-sm font-semibold text-neutral-950">Cast</h3>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {cast.slice(0, 12).map((member) =>
                    member.__typename === 'Cast' ? (
                      <div key={member.id} className="flex gap-3 items-center">
                        {member.person.imageUrl && (
                          <img
                            src={member.person.imageUrl}
                            alt={member.person.name}
                            className="w-12 h-12 rounded-full object-cover"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-neutral-950 truncate">{member.person.name}</p>
                          <p className="text-xs text-neutral-500 truncate">{member.character}</p>
                        </div>
                      </div>
                    ) : null,
                  )}
                </div>
              </div>
            </Card>
          )}

          {movie.reviews && movie.reviews.length > 0 && (
            <Card>
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-neutral-950" />
                  <h3 className="text-sm font-semibold text-neutral-950">Reviews ({movie.reviews.length})</h3>
                </div>
                <div className="space-y-3">
                  {movie.reviews.slice(0, 5).map((review) => (
                    <div key={review.id} className="border-l-2 border-neutral-200 pl-3">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="flex items-center gap-1">
                          <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />
                          <span className="text-sm font-medium text-neutral-950">{review.rating}</span>
                        </div>
                        <span className="text-xs text-neutral-400">{review.createdAt.toLocaleDateString()}</span>
                      </div>
                      {review.text && <p className="text-sm text-neutral-600 line-clamp-3">{review.text}</p>}
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
