import { TMDB_API_KEY } from '$app/env/private';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ fetch }) => {
	try {
		if (!TMDB_API_KEY) {
			console.error('TMDB_API_KEY is not configured in environment variables.');
			return {
				genres: []
			};
		}

		const res = await fetch(
			`https://api.themoviedb.org/3/genre/movie/list?api_key=${TMDB_API_KEY}&language=th-TH`
		);

		if (!res.ok) {
			console.error(`TMDB API error (${res.status} ${res.statusText})`);
			return {
				genres: []
			};
		}

		const data = await res.json();

		return {
			genres: data.genres || []
		};
	} catch (error) {
		console.error('Error fetching genres from TMDB:', error);
		return {
			genres: []
		};
	}
};
