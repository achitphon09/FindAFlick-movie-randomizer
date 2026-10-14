<script lang="ts">
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let genres = $derived(data.genres || []);

	let movies = $state<any[]>([]);
	let isLoading = $state(false);
	let randomMovie = $state<any | null>(null);
	let isModalOpen = $state(false);

	// ตัวแปรสำหรับระบบค้นหา
	let searchQuery = $state('');
	let isSearching = $state(false);

	// ตัวแปรสำหรับ Modal รายละเอียดหนัง (คลิกที่การ์ด)
	let isDetailModalOpen = $state(false);
	let selectedMovieDetails = $state<any | null>(null);
	let isDetailLoading = $state(false);

	//สั่น
	let isShaking = $state(false);

	let currentPage = $state(1);
	let totalPages = $state(500); // TMDB ลิมิตไว้สูงสุด 500 หน้า

	let topMovies = $state<any[]>([]);

	let currentSort = $state<string | null>(null); // เก็บสถานะปุ่ม Sort ปัจจุบัน
	let selectedGenreId = $state<number | null>(null);

	let trailerKey = $state<string | null>(null);
	let isPlayingTrailer = $state<boolean>(false);

	let randomTrailerKey = $state<string | null>(null);
	let isPlayingRandomMovieTrailer = $state<boolean>(false);

	let viewMode = $state<'home' | 'genre' | 'sort' | 'search' | 'provider'>('home');
	let selectedProviderId = $state<number | null>(null);

	let randomMovieProviders = $state<any[]>([]);

	// 1. ดึงหนังตามหมวดหมู่
	// เมื่อผู้ใช้เลือกหมวดหมู่
	async function fetchMoviesByGenre(genreId: number, page: number = 1) {
		isLoading = true;
		isSearching = false;
		searchQuery = '';
		selectedGenreId = genreId;
		currentSort = null; // ล้างสถานะ Sort ทิ้งทันที!
		currentPage = page;

		try {
			const endpoint = `/discover/movie?with_genres=${genreId}&language=th-TH&page=${page}`;
			const res = await fetch(`/api/movies?endpoint=${encodeURIComponent(endpoint)}`);
			const data = await res.json();

			movies = data.results || [];
			totalPages = data.total_pages > 500 ? 500 : data.total_pages || 1;
		} catch (e) {
			console.error('Error fetching movies by genre:', e);
			movies = [];
		} finally {
			isLoading = false;
		}
	}

	// 2. ค้นหาหนัง
	async function searchMovies(page: number = 1) {
		// เช็กก่อนว่ามีคำค้นหาไหม
		if (!searchQuery || !searchQuery.trim()) return;

		isLoading = true;
		isSearching = true; // บังคับเปิดโหมดค้นหา
		selectedGenreId = null; // เคลียร์ค่าหมวดหมู่ทิ้งทันที เพื่อไม่ให้ตีกัน
		currentPage = page;

		try {
			const res = await fetch(
				`/api/movies?endpoint=${encodeURIComponent(`/search/movie?query=${encodeURIComponent(searchQuery.trim())}&language=th-TH&page=${page}`)}`
			);
			const data = await res.json();

			movies = data.results || [];
			totalPages = data.total_pages > 500 ? 500 : data.total_pages || 1;
		} catch (e) {
			console.error('Error searching movies:', e);
			movies = [];
		} finally {
			isLoading = false;
		}
	}

	// 3. สุ่มหนัง (หน้า 1-500)
	async function pickRandomMovie() {
		isShaking = true;
		setTimeout(() => {
			isShaking = false;
		}, 400);

		try {
			const randomPage = Math.floor(Math.random() * 500) + 1;
			let queryPath = `/discover/movie?language=th-TH&page=${randomPage}`;
			if (selectedGenreId && !isSearching) {
				queryPath += `&with_genres=${selectedGenreId}`;
			}

			const res = await fetch(`/api/movies?endpoint=${encodeURIComponent(queryPath)}`);
			const data = await res.json();

			let pickedMovie;
			if (data.results && data.results.length > 0) {
				pickedMovie = data.results[Math.floor(Math.random() * data.results.length)];
			} else if (movies.length > 0) {
				pickedMovie = movies[Math.floor(Math.random() * movies.length)];
			} else {
				return;
			}

			// ดึงสตรีมมิ่งผ่าน Endpoint ของเราเช่นกัน
			const detailRes = await fetch(
				`/api/movies?endpoint=${encodeURIComponent(`/movie/${pickedMovie.id}?language=th-TH&append_to_response=watch/providers`)}`
			);
			randomMovie = await detailRes.json();

			isModalOpen = true;
		} catch (error) {
			console.error('Error picking random movie:', error);
		}
		if (randomMovie?.id) {
			fetchRandomMovieTrailer(randomMovie.id);
		}
	}

	function changePage(newPage: number) {
		if (newPage < 1 || newPage > totalPages) return;

		window.scrollTo({ top: 0, behavior: 'smooth' }); // เลื่อนขึ้นบนสุดอัตโนมัติ

		// เช็คชัดเจนว่าตอนนี้อยู่โหมดค้นหา หรือโหมดหมวดหมู่
		if (isSearching && searchQuery.trim() !== '') {
			searchMovies(newPage);
		} else if (selectedGenreId !== null) {
			fetchMoviesByGenre(selectedGenreId, newPage);
		} else {
			// กรณีสำรอง ถ้าไม่มีสถานะอะไรเลย ให้ดึงหน้าแรกของหมวดแรกสุด
			if (genres.length > 0) {
				selectedGenreId = genres[0].id;
				fetchMoviesByGenre(selectedGenreId, newPage);
			}
		}
	}
	// ฟังก์ชันแปลงเวลาหนัง
	function formatRuntime(minutes: number) {
		if (!minutes) return 'ไม่ระบุเวลา';
		const h = Math.floor(minutes / 60);
		const m = minutes % 60;
		return h > 0 ? `${h} ชม. ${m} นาที` : `${m} นาที`;
	}

	// โหลดหมวดหมู่แรกอัตโนมัติเมื่อเปิดเว็บ
	$effect(() => {
		if (selectedGenreId === null && genres.length > 0 && !isSearching) {
			selectedGenreId = genres[0].id;
			fetchMoviesByGenre(genres[0].id);
		}
	});

	let currentGenreName = $derived(
		isSearching
			? `ค้นหา: "${searchQuery}"`
			: genres.find((g: { id: number }) => g.id === selectedGenreId)?.name || ''
	);

	async function fetchTopMovies() {
		try {
			// ดึงหนังเรตติ้งสูงสุดจาก TMDB
			const res = await fetch(
				`/api/movies?endpoint=${encodeURIComponent(`/movie/top_rated?language=th-TH&page=1`)}`
			);
			const data = await res.json();

			// ตัดมาแค่ 10 อันดับแรก
			topMovies = (data.results || []).slice(0, 10);
		} catch (e) {
			console.error('Error fetching top movies:', e);
			topMovies = [];
		}
	}

	// เรียกใช้งานตอนโหลดหน้าเว็บ
	$effect(() => {
		fetchTopMovies();
	});

	//ฟังก์ชั่นเล่นตัวอย่างหนัง
	async function openMovieDetails(movieId: number) {
		isDetailModalOpen = true;
		isDetailLoading = true;
		selectedMovieDetails = null;
		trailerKey = null;
		isPlayingTrailer = false;

		try {
			// 🍿 ใส่ include_video_language=th,en,null เพื่อดึงวิดีโอทั้งภาษาไทย ภาษาอังกฤษ และคลิปทั่วไป
			const endpoint = `/movie/${movieId}?language=th-TH&append_to_response=videos,watch/providers&include_video_language=th,en,null`;
			const res = await fetch(`/api/movies?endpoint=${encodeURIComponent(endpoint)}`);
			const data = await res.json();

			selectedMovieDetails = data;

			const videos = data.videos?.results || [];

			// 1. ค้นหา Trailer ภาษาไทยก่อนเป็นอันดับแรก
			let trailer = videos.find(
				(v: any) => v.site === 'YouTube' && v.type === 'Trailer' && v.iso_639_1 === 'th'
			);

			// 2. ถ้าไม่มีคลิปไทย ให้เอา Trailer ภาษาอังกฤษ/สากล
			if (!trailer) {
				trailer = videos.find((v: any) => v.site === 'YouTube' && v.type === 'Trailer');
			}

			// 3. ถ้าไม่มีประเภท Trailer เลย ให้เอาวิดีโอ YouTube อันแรกเท่าที่มี (เช่น Teaser/Clip)
			if (!trailer) {
				trailer = videos.find((v: any) => v.site === 'YouTube');
			}

			if (trailer && trailer.key) {
				trailerKey = trailer.key;
			}
		} catch (e) {
			console.error('Error fetching movie details:', e);
		} finally {
			isDetailLoading = false;
		}
	}

	// 🛡️ ฟังก์ชันปิด Modal แบบล้างค่าทุกอย่าง
	function closeModal() {
		isDetailModalOpen = false;
		isPlayingTrailer = false;
		trailerKey = null;
	}

	async function fetchRandomMovieTrailer(movieId: number) {
		randomTrailerKey = null;
		isPlayingRandomMovieTrailer = false;
		randomMovieProviders = []; // เคลียร์สตรีมมิ่งเก่าก่อนสุ่มใหม่

		try {
			// 🍿 พ่วง watch/providers เข้าไปใน append_to_response ด้วย
			const endpoint = `/movie/${movieId}?language=th-TH&append_to_response=videos,watch/providers&include_video_language=th,en,null`;
			const res = await fetch(`/api/movies?endpoint=${encodeURIComponent(endpoint)}`);
			const data = await res.json();

			// จัดการคลิปวิดีโอ (เหมือนเดิม)
			const videos = data.videos?.results || [];
			let trailer =
				videos.find(
					(v: any) => v.site === 'YouTube' && v.type === 'Trailer' && v.iso_639_1 === 'th'
				) ||
				videos.find((v: any) => v.site === 'YouTube' && v.type === 'Trailer') ||
				videos.find((v: any) => v.site === 'YouTube');

			if (trailer && trailer.key) {
				randomTrailerKey = trailer.key;
			}

			// 🌟 ดึงข้อมูลสตรีมมิ่งเฉพาะในไทย (TH) แบบเหมาจ่ายรายเดือน (flatrate)
			if (data['watch/providers']?.results?.TH?.flatrate) {
				randomMovieProviders = data['watch/providers'].results.TH.flatrate;
			}
		} catch (e) {
			console.error('Error fetching random movie details:', e);
		}
	}

	function closeRandomModal() {
		isModalOpen = false;
		isPlayingRandomMovieTrailer = false;
		randomTrailerKey = null;
		randomMovieProviders = []; // 👈 เพิ่มบรรทัดนี้
	}

	// 📺 ฟังก์ชันกรองตามสตรีมมิ่ง (เซฟตี้ ไม่ตีกับหมวดหมู่)
	async function filterByPlatform(providerId: number | null) {
		// 1. 🛡️ เคลียร์สถานะหมวดหมู่เดิมและคำค้นหาทันที ป้องกันข้อมูลซ้ำซ้อน
		selectedGenreId = null;
		searchQuery = '';

		// ถ้ากดปุ่ม "ทั้งหมด" ให้กลับไปหน้าแรก
		if (providerId === null) {
			selectedProviderId = null;
			viewMode = 'home';
			movies = [];
			return;
		}

		selectedProviderId = providerId;
		viewMode = 'provider'; // 👈 ตั้งโหมดเป็น provider ชัดเจน
		isLoading = true;

		try {
			const endpoint = `/discover/movie?language=th-TH&watch_region=TH&with_watch_providers=${providerId}&with_watch_monetization_types=flatrate&sort_by=popularity.desc&page=1`;
			const res = await fetch(`/api/movies?endpoint=${encodeURIComponent(endpoint)}`);
			const data = await res.json();

			movies = data.results || [];
		} catch (e) {
			console.error('Error fetching platform movies:', e);
		} finally {
			isLoading = false;
		}
	}

	// 📌 ⚠️ สำคัญมาก: ในฟังก์ชันกดเลือกหมวดหมู่เดิม (เช่น filterByGenre) ให้ใส่บรรทัดนี้ไว้ด้วย
	async function filterByGenre(genreId: number) {
		// 1. 🛡️ เคลียร์สถานะอื่นๆ ออกทันที ไม่ให้ข้อมูลตีกัน
		selectedProviderId = null; // ล้างค่าสตรีมมิ่งออก เวลาสลับมาเลือกหมวดหมู่ปกติ
		searchQuery = ''; // ล้างคำค้นหาเดิมออก
		selectedGenreId = genreId;
		viewMode = 'genre';
		isLoading = true;

		try {
			// 2. ยิง API ผ่าน TMDB Endpoint สำหรับกรองตามหมวดหมู่ (เรียงตามความนิยม)
			const endpoint = `/discover/movie?language=th-TH&with_genres=${genreId}&sort_by=popularity.desc&page=1`;
			const res = await fetch(`/api/movies?endpoint=${encodeURIComponent(endpoint)}`);
			const data = await res.json();

			// 3. นำผลลัพธ์ใส่ตัวแปร movies เพื่อแสดงการ์ดหนังบนหน้าจอ
			movies = data.results || [];
		} catch (e) {
			console.error('Error fetching movies by genre:', e);
			movies = [];
		} finally {
			isLoading = false;
		}
	}
</script>

<svelte:head>
	<title>FindAFlick</title>
</svelte:head>

<main class="min-h-screen bg-black p-8 text-white">
	<div class="mx-auto max-w-6xl">
		<!-- ส่วนหัวเว็บ -->
		<div class="mb-8 text-center">
			<h1 class="mt-6 mb-2 text-5xl font-bold text-red-500">FindAFlick</h1>
			<p class="mb-6 text-xs whitespace-nowrap text-gray-300 sm:text-base md:text-lg">
				อยากดูหนังแต่ไม่รู้จะดูเรื่องไร ให้เราจัดการให้
			</p>

			<!-- 🎲 ปุ่มสุ่มหนังไฮไลท์ -->
			<button
				onclick={pickRandomMovie}
				disabled={movies.length === 0 || isLoading}
				class="cursor-pointer rounded-full bg-gradient-to-r from-red-600 to-orange-600 px-8 py-4 text-lg font-bold text-white shadow-lg shadow-red-600/40 transition-all hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
			>
				🎲 ไม่รู้จะดูไร ก็สุ่มดิสุ่มเลยเร็ว!
			</button>
		</div>

		<!-- แถบเลือกหมวดหมู่หนัง -->
		<div class="mb-8 flex justify-center px-4">
			<div class="relative w-full max-w-xl transition-all duration-300 focus-within:-translate-y-1">
				<input
					type="text"
					bind:value={searchQuery}
					onkeydown={(e) => e.key === 'Enter' && searchMovies()}
					placeholder="อยากดูเรื่องไรไหนบอกซิ.."
					class="w-full rounded-full border border-white/10 bg-white/5 px-6 py-4 pr-14 text-white placeholder-gray-400 backdrop-blur-md transition-all focus:border-red-500/50 focus:bg-white/10 focus:ring-1 focus:ring-red-500/50 focus:outline-none"
				/>
				<!-- ปุ่มกดแว่นขยาย -->
				<!-- svelte-ignore a11y_consider_explicit_label -->
				<button
					type="button"
					onclick={() => searchMovies()}
					class="absolute top-1/2 right-3 flex h-10 w-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-red-500/20 text-red-400 transition-all hover:bg-red-500 hover:text-white"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						fill="none"
						viewBox="0 0 24 24"
						stroke-width="1.5"
						stroke="currentColor"
						class="pointer-events-none size-6"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
						/>
					</svg>
				</button>
			</div>
		</div>

		<!-- 🗂️ กลุ่มปุ่มหมวดหมู่ -->
		{#if genres.length > 0}
			<div
				class="mb-8 flex [scrollbar-width:none] gap-2 overflow-x-auto px-4 pb-4 [-ms-overflow-style:none] sm:gap-3.5 md:mb-12 md:flex-wrap md:justify-center md:overflow-visible md:pb-0 [&::-webkit-scrollbar]:hidden"
			>
				{#each genres as genre}
					<button
						type="button"
						onclick={() => {
							selectedGenreId = genre.id;
							currentSort = null; // เคลียร์สถานะปุ่ม Sort
							isSearching = false;
							searchQuery = '';

							fetchMoviesByGenre(genre.id);
						}}
						class={`flex-shrink-0 cursor-pointer rounded-full border px-4 py-1.5 text-sm font-semibold tracking-wide whitespace-nowrap backdrop-blur-md transition-all duration-300 active:scale-95 sm:px-6 sm:py-2.5 sm:text-base ${
							selectedGenreId === genre.id && !isSearching && !currentSort
								? 'scale-105 border-red-500/50 bg-red-500/35 text-white shadow-[0_0_15px_rgba(239,68,68,0.35)] drop-shadow-[0_2px_8px_rgba(239,68,68,0.2)]'
								: 'border-white/10 bg-white/5 text-gray-300 hover:border-white/20 hover:bg-white/10 hover:text-white hover:shadow-[0_4px_12px_rgba(255,255,255,0.05)]'
						}`}
					>
						{genre.name}
					</button>
				{/each}
			</div>
		{/if}

		<div class="my-10 w-full px-4">
			<h2 class="mb-4 text-2xl font-bold text-white">Top 10 เขาดูอะไรกันอยู่ตอนนี้</h2>

			<!-- ตัวครอบหลักแบบ relative เพื่อให้ปุ่มลูกศรยึดตำแหน่งอยู่ขอบซ้าย/ขวาได้ -->
			<div class="group relative">
				<!-- ปุ่มเลื่อนซ้าย (แสดงเมื่อเอาเมาส์ช็อต หรือกดเลื่อน) -->
				<!-- svelte-ignore a11y_consider_explicit_label -->
				<button
					type="button"
					onclick={() => {
						const container = document.getElementById('top-movies-container');
						if (container) container.scrollBy({ left: -300, behavior: 'smooth' });
					}}
					class="absolute top-1/2 left-0 z-20 hidden h-24 w-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-r-lg bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/80 md:flex"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						fill="none"
						viewBox="0 0 24 24"
						stroke-width="2.5"
						stroke="currentColor"
						class="size-6"
					>
						<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
					</svg>
				</button>

				<!-- แถวเลื่อนดูหนัง (กำหนด id ไว้สำหรับสั่งเลื่อน) -->
				<div
					id="top-movies-container"
					class="flex [scrollbar-width:none] scrollbar-none gap-4 overflow-x-auto scroll-smooth pt-4 pb-4 pl-6 [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
				>
					{#each topMovies as movie, index}
						<!-- ปรับขนาดการ์ดให้พอดี ไม่ใหญ่เกินไป (เช่น min-w-[130px] และ sm:min-w-[150px]) -->
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div
							class="group/item relative max-w-[130px] min-w-[130px] shrink-0 cursor-pointer sm:max-w-[150px] sm:min-w-[150px]"
							onclick={() => openMovieDetails(movie.id)}
						>
							<!-- ตัวเลขอันดับ ปรับขนาดลงมาให้บาลานซ์กับขนาดการ์ดใหม่ -->
							<span
								class="pointer-events-none absolute -bottom-3 -left-4 z-10 bg-gradient-to-r from-red-600 to-orange-600 bg-clip-text text-7xl font-black text-transparent italic drop-shadow-[0_4px_4px_rgba(0,0,0,0.8)] transition-transform group-hover/item:scale-105 sm:text-8xl"
							>
								{index + 1}
							</span>

							<!-- โปสเตอร์หนัง -->
							<div class="relative aspect-[2/3] overflow-hidden rounded-lg bg-white/5 shadow-lg">
								{#if movie.poster_path}
									<img
										src={`https://image.tmdb.org/t/p/w500${movie.poster_path}`}
										alt={movie.title}
										class="h-full w-full object-cover transition-transform duration-300 group-hover/item:scale-110"
									/>
								{:else}
									<div class="flex h-full items-center justify-center text-xs text-gray-500">
										ไม่มีรูปภาพ
									</div>
								{/if}
							</div>
						</div>
					{/each}
				</div>

				<!-- ปุ่มเลื่อนขวา (สไตล์แคปซูลมนๆ แบบในรูปตัวอย่าง) -->
				<!-- svelte-ignore a11y_consider_explicit_label -->
				<button
					type="button"
					onclick={() => {
						const container = document.getElementById('top-movies-container');
						if (container) container.scrollBy({ left: 300, behavior: 'smooth' });
					}}
					class="absolute top-1/2 right-0 z-20 flex h-24 w-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-l-lg bg-black/60 text-white transition-opacity hover:bg-black/80 md:opacity-0 md:group-hover:opacity-100"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						fill="none"
						viewBox="0 0 24 24"
						stroke-width="2.5"
						stroke="currentColor"
						class="size-6"
					>
						<path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
					</svg>
				</button>
			</div>
		</div>
		<!-- แสดงรายชื่อหนัง -->
		<div>
			<div
				class="mb-8 flex flex-col gap-3 border-b border-white/10 pb-4 sm:flex-row sm:items-center sm:justify-between"
			>
				<h2 class="bg-white bg-clip-text text-2xl font-bold text-transparent drop-shadow-sm">
					หมวดหมู่: {currentGenreName}
				</h2>
				<span
					class="rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-sm text-gray-300 shadow-sm backdrop-blur-md"
				>
					{#if isLoading}
						<span class="animate-pulse">กำลังโหลดข้อมูล...</span>
					{:else}
						พบภาพยนตร์ <span class="font-bold text-white">{movies.length}</span> เรื่อง
					{/if}
				</span>
			</div>

			{#if isLoading}
				<div
					class="animate-pulse rounded-2xl border border-white/5 bg-white/5 py-20 text-center text-lg text-gray-400 backdrop-blur-sm"
				>
					รอสักครู่นะครับพี่... 🎬
				</div>
			{:else if movies.length > 0}
				<div class="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
					{#each movies as movie}
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<div
							onclick={() => openMovieDetails(movie.id)}
							class="group flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/5 shadow-lg backdrop-blur-md transition-all duration-300 hover:-translate-y-2 hover:border-red-400/50 hover:bg-white/10 hover:shadow-[0_0_25px_rgba(248,113,113,0.15)]"
						>
							<div class="relative aspect-[2/3] w-full overflow-hidden bg-black/40">
								{#if movie.poster_path}
									<img
										src="https://image.tmdb.org/t/p/w500{movie.poster_path}"
										alt={movie.title}
										class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
										loading="lazy"
									/>
								{:else}
									<div
										class="flex h-full items-center justify-center p-4 text-center text-xs text-gray-500"
									>
										ไม่มีรูปภาพโปสเตอร์
									</div>
								{/if}

								<div
									class="absolute top-2 right-2 rounded-lg border border-white/20 bg-black/50 px-2.5 py-1 text-xs font-bold text-yellow-400 shadow-sm backdrop-blur-md"
								>
									⭐ IMDB {movie.vote_average ? movie.vote_average.toFixed(1) : 'N/A'}
								</div>
							</div>

							<div
								class="flex flex-grow cursor-pointer flex-col justify-between border-t border-white/5 bg-black/20 p-4"
							>
								<h3
									class="mb-1 line-clamp-1 text-sm font-semibold text-white transition-colors group-hover:text-red-500"
									title={movie.title}
								>
									{movie.title}
								</h3>
								<p class="line-clamp-2 text-xs leading-relaxed text-gray-400">
									{movie.overview || 'ไม่มีคำอธิบายเนื้อเรื่องย่อ...'}
								</p>
							</div>
						</div>
					{/each}
				</div>
				<div class="my-8 flex flex-wrap items-center justify-center gap-3 px-4 md:my-10 md:gap-4">
    <!-- ปุ่มหน้าก่อนหน้า -->
    <button
        onclick={() => changePage(currentPage - 1)}
        disabled={currentPage === 1 || isLoading}
        class="flex flex-1 cursor-pointer items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white shadow-lg backdrop-blur-md transition-all hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30 md:flex-none md:px-5"
    >
        ← ก่อนหน้า
    </button>

    <!-- 🌟 ช่องกรอกเลขหน้าเพื่อกระโดดข้ามแบบรวดเร็ว -->
    <form
        onsubmit={(e) => {
            e.preventDefault();
            const formData = new FormData(e.currentTarget);
            const pageNumber = parseInt(formData.get('pageInput') as string);
            
            // เช็กว่ากรอกเลขถูกต้อง (ไม่น้อยกว่า 1, ไม่เกินหน้าที่มีทั้งหมด และไม่ใช่หน้าปัจจุบัน)
            if (pageNumber >= 1 && pageNumber <= totalPages && pageNumber !== currentPage) {
                changePage(pageNumber);
            } else {
                // ถ้ากรอกเลขผิด หรือเป็นหน้าปัจจุบัน ให้รีเซ็ตกลับเป็นเลขหน้าเดิม
                (e.currentTarget.elements.namedItem('pageInput') as HTMLInputElement).value = currentPage.toString();
            }
        }}
        class="order-last mt-1 flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 backdrop-blur-md transition-all hover:border-white/20 md:order-none md:mt-0 md:w-auto md:py-1.5"
    >
        <span class="text-sm font-medium text-gray-300">หน้า</span>
        <input
            name="pageInput"
            type="number"
            min="1"
            max={totalPages}
            value={currentPage}
            title="พิมพ์เลขหน้าแล้วกด Enter"
            class="w-16 rounded-md border border-white/20 bg-black/40 py-1 text-center text-sm font-bold text-white outline-none transition-all focus:border-red-500 focus:bg-black focus:ring-1 focus:ring-red-500 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <span class="text-sm font-medium text-gray-300">/ {totalPages}</span>
        
        <button
            type="submit"
            class="ml-1 cursor-pointer rounded-lg bg-red-600/80 px-3 py-1.5 text-xs font-bold text-white shadow-md transition-all hover:bg-red-500 active:scale-95"
        >
            สาดไปสมาชิก
        </button>
    </form>

    <!-- ปุ่มหน้าถัดไป -->
    <button
        onclick={() => changePage(currentPage + 1)}
        disabled={currentPage >= totalPages || isLoading}
        class="flex flex-1 cursor-pointer items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white shadow-lg backdrop-blur-md transition-all hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30 md:flex-none md:px-5"
    >
        ถัดไป →
    </button>
</div>
			{:else}
				<div
					class="rounded-2xl border border-white/5 bg-white/5 py-16 text-center text-gray-400 backdrop-blur-sm"
				>
					ไม่พบรายชื่อหนังในหมวดหมู่นี้
				</div>
			{/if}
		</div>
	</div>
</main>

<!-- 🎬 Modal แสดงผลลัพธ์เมื่อกดสุ่มหนัง -->
{#if isModalOpen && randomMovie}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-md transition-all duration-300"
		onclick={(e) => {
			if (e.target === e.currentTarget) closeRandomModal();
		}}
	>
		<!-- ตัวกล่อง Modal แบบ Glassmorphism -->
		<div
			class="animate-in fade-in zoom-in relative w-full max-w-xl overflow-hidden rounded-3xl border border-white/10 bg-white/5 shadow-[0_8px_32px_rgba(0,0,0,0.5)] backdrop-blur-2xl duration-200 {isShaking
				? 'animate-shake'
				: ''}"
		>
			<!-- ❌ ปุ่มปิด X มุมขวาบน (มือถือ) -->
			<button
				type="button"
				onclick={closeRandomModal}
				class="absolute top-3 right-3 z-50 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition-all hover:bg-black/70 active:scale-95 md:hidden"
				aria-label="Close modal"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					stroke-width="2.5"
					stroke="currentColor"
					class="size-5"
				>
					<path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
				</svg>
			</button>

			<div class="flex flex-col p-6 md:p-8">
				<!-- 🎬 เล่นตัวอย่างหนัง YouTube (พร้อมมาสก์ตัดขอบโค้งเนียนสนิท ไม่แลบเป็นสี่เหลี่ยม) -->
				{#if isPlayingRandomMovieTrailer && randomTrailerKey}
					<div
						class="relative isolate mb-6 aspect-video w-full translate-z-0 transform overflow-hidden rounded-2xl border border-white/10 bg-black shadow-2xl"
						style="mask-image: radial-gradient(white, black); -webkit-mask-image: -webkit-radial-gradient(white, black);"
					>
						<iframe
							src={`https://www.youtube.com/embed/${randomTrailerKey}?autoplay=1`}
							title="Random Movie Trailer"
							class="h-full w-full rounded-2xl border-0"
							allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
							allowfullscreen
						></iframe>
						<button
							type="button"
							onclick={() => (isPlayingRandomMovieTrailer = false)}
							class="absolute top-2 right-2 z-10 cursor-pointer rounded-full bg-black/70 px-3 py-1 text-xs font-bold text-white backdrop-blur-sm hover:bg-black"
						>
							✕ ปิดตัวอย่างหนัง
						</button>
					</div>
				{/if}

				<div class="flex flex-col gap-6 md:flex-row">
					<!-- โปสเตอร์ใน Modal -->
					<div
						class="mx-auto aspect-[2/3] w-36 flex-shrink-0 overflow-hidden rounded-xl border border-white/10 bg-black/40 shadow-xl md:w-48"
					>
						{#if randomMovie.poster_path}
							<img
								src="https://image.tmdb.org/t/p/w500{randomMovie.poster_path}"
								alt={randomMovie.title}
								class="h-full w-full object-cover"
							/>
						{:else}
							<div class="flex h-full items-center justify-center text-xs text-gray-500">
								ไม่มีรูปภาพ
							</div>
						{/if}
					</div>

					<!-- รายละเอียดหนัง -->
					<div class="flex flex-grow flex-col justify-between text-left">
						<div>
							<div class="mb-3 flex items-start justify-between">
								<span
									class="rounded-full border border-yellow-400/30 bg-yellow-500/20 px-3 py-1 text-sm font-bold text-yellow-300 backdrop-blur-md"
								>
									⭐ IMDB {randomMovie.vote_average ? randomMovie.vote_average.toFixed(1) : 'N/A'}
								</span>
							</div>
							<h3 class="mb-2 text-2xl font-bold text-white drop-shadow-md">{randomMovie.title}</h3>
							<p class="mb-4 max-h-36 overflow-y-auto text-sm leading-relaxed text-gray-300">
								{randomMovie.overview || 'ไม่มีคำอธิบายเนื้อเรื่องย่อสำหรับภาพยนตร์เรื่องนี้'}
							</p>
						</div>

						<!-- ส่วนแสดงแพลตฟอร์มสตรีมมิ่งที่เพิ่มเข้ามาใหม่ -->
						{#if randomMovieProviders.length > 0}
							<div class="mb-4 rounded-xl border border-white/10 bg-black/20 p-3 backdrop-blur-sm">
								<h4 class="mb-2 text-xs font-semibold text-gray-400">
									อ๋อเรื่องนี้อยู่ในแพลตฟอร์ม
								</h4>
								<div class="flex flex-wrap gap-2">
									{#each randomMovieProviders as provider}
										<div
											class="flex items-center gap-2 rounded-lg border border-white/10 bg-white/10 px-2 py-1 pr-3 shadow-sm transition-colors hover:bg-white/20"
										>
											<img
												src={`https://image.tmdb.org/t/p/w92${provider.logo_path}`}
												alt={provider.provider_name}
												class="h-6 w-6 rounded-md object-cover shadow-sm"
											/>
											<span class="text-xs font-bold text-white">{provider.provider_name}</span>
										</div>
									{/each}
								</div>
							</div>
						{/if}

						<!-- ปุ่มกดดูตัวอย่างหนัง (กรณีไม่ได้เปิดวิดีโออยู่) -->
						{#if randomTrailerKey && !isPlayingRandomMovieTrailer}
							<button
								type="button"
								onclick={() => (isPlayingRandomMovieTrailer = true)}
								class="mb-4 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-red-600/90 py-2.5 text-sm font-bold text-white shadow-lg shadow-red-600/30 transition-all hover:bg-red-600 active:scale-95"
							>
								<span>ชมตัวอย่างภาพยนตร์ (Trailer)</span>
							</button>
						{/if}

						<!-- กลุ่มปุ่มกดแบบ Glassmorphism (สุ่มใหม่ / ปิด) -->
						<div class="mt-2 flex gap-3">
							<button
								onclick={() => {
									isPlayingRandomMovieTrailer = false;
									pickRandomMovie();
								}}
								class="flex-1 cursor-pointer rounded-xl border border-red-500/50 bg-red-500/20 py-3 text-sm font-bold text-red-100 shadow-lg backdrop-blur-md transition-all hover:bg-red-500/40 hover:shadow-[0_0_15px_rgba(239,68,68,0.3)] active:scale-95"
							>
								🎲 ไม่ถูกใจหรอ? สุ่มอีกรอบสิ
							</button>
							<button
								onclick={closeRandomModal}
								class="cursor-pointer rounded-xl border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-gray-300 shadow-lg backdrop-blur-md transition-all hover:bg-white/10 hover:text-white active:scale-95"
							>
								ปิด
							</button>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>
{/if}

{#if isDetailModalOpen}
	<!-- Backdrop คลิกพื้นหลังเพื่อปิด Modal ได้ -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md transition-all duration-300"
		onclick={(e) => {
			if (e.target === e.currentTarget) closeModal();
		}}
	>
		<div
			class="animate-in fade-in zoom-in relative w-full max-w-2xl overflow-hidden rounded-3xl border border-white/10 bg-white/5 shadow-[0_8px_32px_rgba(0,0,0,0.5)] backdrop-blur-3xl"
		>
			<!-- ❌ ปุ่มปิด X มุมขวาบน (แสดงเฉพาะบนมือถือ ซ่อนบน Desktop อัตโนมัติ) -->
			<button
				type="button"
				onclick={closeModal}
				class="absolute top-3 right-3 z-50 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition-all hover:bg-black/70 active:scale-95 md:hidden"
				aria-label="Close modal"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					stroke-width="2.5"
					stroke="currentColor"
					class="size-5"
				>
					<path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
				</svg>
			</button>

			{#if isDetailLoading}
				<!-- หน้าต่างโหลดข้อมูล -->
				<div class="flex h-64 flex-col items-center justify-center text-gray-400">
					<span class="mb-4 animate-bounce text-4xl">🍿</span>
					<p>กำลังโหลดใจเย็น ๆ</p>
				</div>
			{:else if selectedMovieDetails}
				<!-- รายละเอียดหนัง -->
				<div
					class="flex max-h-[85vh] [scrollbar-width:none] flex-col overflow-y-auto [-ms-overflow-style:none] md:flex-row [&::-webkit-scrollbar]:hidden"
				>
					<!-- โปสเตอร์ด้านซ้าย -->
					<div class="relative w-full flex-shrink-0 bg-black/40 md:w-1/3">
						{#if selectedMovieDetails.poster_path}
							<img
								src="https://image.tmdb.org/t/p/w500{selectedMovieDetails.poster_path}"
								alt={selectedMovieDetails.title}
								class="h-full w-full object-cover"
							/>
						{:else}
							<div class="flex h-full min-h-[300px] items-center justify-center text-gray-500">
								ไม่มีรูปภาพ
							</div>
						{/if}
					</div>

					<!-- ข้อมูลด้านขวา -->
					<div class="flex flex-col p-6 md:w-2/3 md:p-8">
						<div class="mb-2 flex items-center justify-between">
							<span
								class="rounded-full border border-yellow-400/30 bg-yellow-500/20 px-3 py-1 text-sm font-bold text-yellow-300"
							>
								⭐ IMDB {selectedMovieDetails.vote_average
									? selectedMovieDetails.vote_average.toFixed(1)
									: 'N/A'}
							</span>
							<span class="text-sm text-gray-400"
								>{selectedMovieDetails.release_date?.split('-')[0] || 'N/A'}</span
							>
						</div>

						<h2 class="mb-4 text-2xl font-bold text-white drop-shadow-md md:text-3xl">
							{selectedMovieDetails.title}
						</h2>

						<!-- หมวดหมู่ & เวลา -->
						<div class="mb-4 flex flex-wrap items-center gap-2 text-sm text-gray-300">
							<span class="flex items-center gap-1 rounded-lg bg-white/10 px-2 py-1">
								⏱️ {formatRuntime(selectedMovieDetails.runtime)}
							</span>
							{#each selectedMovieDetails.genres as genre}
								<span class="rounded-lg border border-white/10 bg-white/5 px-2 py-1">
									{genre.name}
								</span>
							{/each}
						</div>

						<!-- 🎬 ส่วนวิดีโอตัวอย่างหนัง YouTube (แสดงสลับระหว่างปุ่มกดเล่น กับ เครื่องเล่นวิดีโอ) -->
						{#if isPlayingTrailer && trailerKey}
							<!-- 1. ใส่ isolate transform translate-z-0 และ Inline Style Mask เพื่อล็อกขอบโค้งให้เด็ดขาด -->
							<div
								class="relative isolate mb-4 aspect-video w-full translate-z-0 transform overflow-hidden rounded-2xl border border-white/10 bg-black shadow-2xl"
								style="mask-image: radial-gradient(white, black); -webkit-mask-image: -webkit-radial-gradient(white, black);"
							>
								<!-- 2. เพิ่ม rounded-2xl ที่ <iframe> ด้วยเพื่อล็อกขอบจากด้านในซ้ำอีกชั้น -->
								<iframe
									src={`https://www.youtube.com/embed/${trailerKey}?autoplay=1`}
									title="Movie Trailer"
									class="h-full w-full rounded-2xl border-0"
									allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
									allowfullscreen
								></iframe>

								<!-- ปุ่มปิดตัวอย่างหนัง -->
								<button
									type="button"
									onclick={() => (isPlayingTrailer = false)}
									class="absolute top-2 right-2 z-10 cursor-pointer rounded-full bg-black/70 px-3 py-1 text-xs font-bold text-white backdrop-blur-sm hover:bg-black"
								>
									✕ ปิดตัวอย่างหนัง
								</button>
							</div>
						{:else if trailerKey}
							<!-- ปุ่มกดเปิด Trailer (เก็บไว้เหมือนเดิม) -->
							<button
								type="button"
								onclick={() => (isPlayingTrailer = true)}
								class="mb-4 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-red-600/90 py-2.5 text-sm font-bold text-white shadow-lg shadow-red-600/30 transition-all hover:bg-red-600 active:scale-95"
							>
								<span>ชมตัวอย่างภาพยนตร์ (Trailer)</span>
							</button>
						{/if}

						<!-- คำอธิบายหนัง -->
						<div class="mb-6 flex-grow">
							<h4 class="mb-2 text-sm font-semibold text-gray-400">เนื้อเรื่องย่อ</h4>
							<p class="text-sm leading-relaxed text-gray-300">
								{selectedMovieDetails.overview ||
									'ไม่มีคำอธิบายเนื้อเรื่องย่อสำหรับภาพยนตร์เรื่องนี้'}
							</p>
						</div>

						<!-- แพลตฟอร์มสตรีมมิ่ง (ดึงเฉพาะประเทศ TH) -->
						<div class="mb-6">
							<h4 class="mb-3 text-sm font-semibold text-gray-400">ดูได้ที่ไหนบ้าง (สตรีมมิ่ง)</h4>
							<div class="flex flex-wrap gap-3">
								{#if selectedMovieDetails['watch/providers']?.results?.TH?.flatrate}
									{#each selectedMovieDetails['watch/providers'].results.TH.flatrate as provider}
										<img
											src="https://image.tmdb.org/t/p/w92{provider.logo_path}"
											alt={provider.provider_name}
											title={provider.provider_name}
											class="h-10 w-10 rounded-xl shadow-lg transition-transform hover:scale-110"
										/>
									{/each}
								{:else}
									<span
										class="rounded-lg border border-white/5 bg-white/5 px-3 py-2 text-sm text-gray-500"
									>
										ไม่มีข้อมูลสตรีมมิ่งในไทย ว่ะฮ่ะฮ่าาา
									</span>
								{/if}
							</div>
						</div>

						<!-- ปุ่มปิดด้านล่าง -->
						<button
							type="button"
							onclick={closeModal}
							class="w-full cursor-pointer rounded-xl border border-white/10 bg-white/10 py-3 text-sm font-bold text-white transition-all hover:bg-white/20 active:scale-95"
						>
							ปิดหน้าต่าง
						</button>
					</div>
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	@keyframes shake {
		0%,
		100% {
			transform: translateX(0) rotate(0deg);
		}
		20% {
			transform: translateX(-6px) rotate(-1.5deg);
		}
		40% {
			transform: translateX(6px) rotate(1.5deg);
		}
		60% {
			transform: translateX(-4px) rotate(-1deg);
		}
		80% {
			transform: translateX(4px) rotate(1deg);
		}
	}

	.animate-shake {
		animation: shake 0.4s ease-in-out;
	}
</style>
