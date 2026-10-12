import { TMDB_API_KEY } from '$app/env/private';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, fetch }) => {
    const endpoint = url.searchParams.get('endpoint'); // รับ path ที่จะยิงไป TMDB
    if (!endpoint) return json({ error: 'Missing endpoint' }, { status: 400 });

    try {
        const tmdbUrl = `https://api.themoviedb.org/3${endpoint}&api_key=${TMDB_API_KEY}`;
        const res = await fetch(tmdbUrl);
        const data = await res.json();
        return json(data);
    } catch (error) {
        return json({ error: 'Failed to fetch from TMDB' }, { status: 500 });
    }
};