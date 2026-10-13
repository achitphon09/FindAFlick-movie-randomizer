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
        totalPages = data.total_pages > 500 ? 500 : (data.total_pages || 1);
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
        isSearching = true;       // บังคับเปิดโหมดค้นหา
        selectedGenreId = null;   // เคลียร์ค่าหมวดหมู่ทิ้งทันที เพื่อไม่ให้ตีกัน
        currentPage = page;
        
        try {
            const res = await fetch(`/api/movies?endpoint=${encodeURIComponent(`/search/movie?query=${encodeURIComponent(searchQuery.trim())}&language=th-TH&page=${page}`)}`);
            const data = await res.json();
            
            movies = data.results || [];
            totalPages = data.total_pages > 500 ? 500 : (data.total_pages || 1);
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
        setTimeout(() => { isShaking = false; }, 400);

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
            const detailRes = await fetch(`/api/movies?endpoint=${encodeURIComponent(`/movie/${pickedMovie.id}?language=th-TH&append_to_response=watch/providers`)}`);
            randomMovie = await detailRes.json();
            
            isModalOpen = true;
        } catch (error) {
            console.error('Error picking random movie:', error);
        }
    }

    // 4. ดูรายละเอียดหนังเมื่อคลิกการ์ด
    async function openMovieDetails(movieId: number) {
        isDetailModalOpen = true;
        isDetailLoading = true;
        
        try {
            const res = await fetch(`/api/movies?endpoint=${encodeURIComponent(`/movie/${movieId}?language=th-TH&append_to_response=watch/providers`)}`);
            selectedMovieDetails = await res.json();
        } catch (error) {
            console.error('Error fetching movie details:', error);
        } finally {
            isDetailLoading = false;
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
        const res = await fetch(`/api/movies?endpoint=${encodeURIComponent(`/movie/top_rated?language=th-TH&page=1`)}`);
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

</script>

<svelte:head>
	<title>FindAFlick</title>
</svelte:head>

<main class="min-h-screen bg-black p-8 text-white">
	<div class="mx-auto max-w-6xl">
		<!-- ส่วนหัวเว็บ -->
		<div class="mb-8 text-center">
			<h1 class="mt-6 mb-2 text-5xl font-bold text-red-500">FindAFlick</h1>
			<p class="mb-6 text-lg text-gray-300">อยากดูหนังแต่ไม่รู้จะดูเรื่องไร ให้เราจัดการให้</p>

			<!-- 🎲 ปุ่มสุ่มหนังไฮไลท์ -->
			<button
				onclick={pickRandomMovie}
				disabled={movies.length === 0 || isLoading}
				class="rounded-full bg-gradient-to-r from-red-600 to-orange-600 px-8 py-4 text-lg font-bold text-white shadow-lg shadow-red-600/40 transition-all hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
			>
				🎲 ไม่รู้จะดูไร ก็สุ่มดิสุ่มเลยเร็ว!
			</button>
		</div>

		<!-- แถบเลือกหมวดหมู่หนัง -->
	<div class="mb-8 flex justify-center px-4">
    <div class="relative w-full max-w-xl transition-all duration-300 focus-within:-translate-y-1 ">
        <input
            type="text"
            bind:value={searchQuery}
            onkeydown={(e) => e.key === 'Enter' && searchMovies()}
            placeholder="อยากดูเรื่องไรไหนบอกซิ.."
            class="w-full rounded-full border border-white/10 bg-white/5 px-6 py-4 pr-14 text-white placeholder-gray-400 backdrop-blur-md transition-all focus:border-red-500/50 focus:bg-white/10 focus:outline-none focus:ring-1 focus:ring-red-500/50"
        />
        <!-- ปุ่มกดแว่นขยาย -->
        <!-- svelte-ignore a11y_consider_explicit_label -->
        <button
			type="button"
            onclick={() => searchMovies()}
            class="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-red-500/20 text-red-400 transition-all hover:bg-red-500 hover:text-white cursor-pointer"
        >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6 pointer-events-none">
  <path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
</svg>

        </button>
    </div>
</div>

<!-- 🗂️ กลุ่มปุ่มหมวดหมู่ -->
{#if genres.length > 0}
    <div class="mb-8 flex overflow-x-auto px-4 pb-4 md:mb-12 md:flex-wrap md:justify-center md:overflow-visible md:pb-0 gap-2 sm:gap-3.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
                class={`flex-shrink-0 whitespace-nowrap rounded-full border px-4 py-1.5 text-sm sm:px-6 sm:py-2.5 sm:text-base font-semibold tracking-wide backdrop-blur-md transition-all duration-300 active:scale-95 cursor-pointer ${
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
    <div class="relative group">
        
        <!-- ปุ่มเลื่อนซ้าย (แสดงเมื่อเอาเมาส์ช็อต หรือกดเลื่อน) -->
        <button 
            type="button"
            onclick={() => {
                const container = document.getElementById('top-movies-container');
                if (container) container.scrollBy({ left: -300, behavior: 'smooth' });
            }}
            class="absolute left-0 top-1/2 -translate-y-1/2 z-20 hidden md:flex h-24 w-10 items-center justify-center rounded-r-lg bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80 cursor-pointer"
        >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="size-6">
                <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
        </button>

        <!-- แถวเลื่อนดูหนัง (กำหนด id ไว้สำหรับสั่งเลื่อน) -->
        <div 
            id="top-movies-container"
            class="flex gap-4 overflow-x-auto pl-6 pb-4 pt-4 scrollbar-none [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] scroll-smooth"
        >
            {#each topMovies as movie, index}
                <!-- ปรับขนาดการ์ดให้พอดี ไม่ใหญ่เกินไป (เช่น min-w-[130px] และ sm:min-w-[150px]) -->
                <div 
                    class="group/item relative min-w-[130px] max-w-[130px] sm:min-w-[150px] sm:max-w-[150px] cursor-pointer shrink-0"
                    onclick={() => openMovieDetails(movie.id)}
                >
                    <!-- ตัวเลขอันดับ ปรับขนาดลงมาให้บาลานซ์กับขนาดการ์ดใหม่ -->
                    <span class="absolute -bottom-3 -left-4 z-10 text-7xl font-black italic bg-gradient-to-r from-red-600 to-orange-600 bg-clip-text text-transparent drop-shadow-[0_4px_4px_rgba(0,0,0,0.8)] sm:text-8xl transition-transform group-hover/item:scale-105 pointer-events-none">
                    {index + 1}
                    </span>

                    <!-- โปสเตอร์หนัง -->
                    <div class="relative overflow-hidden rounded-lg bg-white/5 shadow-lg aspect-[2/3]">
                        {#if movie.poster_path}
                            <img 
                                src={`https://image.tmdb.org/t/p/w500${movie.poster_path}`} 
                                alt={movie.title}
                                class="h-full w-full object-cover transition-transform duration-300 group-hover/item:scale-110"
                            />
                        {:else}
                            <div class="flex h-full items-center justify-center text-gray-500 text-xs">ไม่มีรูปภาพ</div>
                        {/if}
                    </div>
                </div>
            {/each}
        </div>

        <!-- ปุ่มเลื่อนขวา (สไตล์แคปซูลมนๆ แบบในรูปตัวอย่าง) -->
        <button 
            type="button"
            onclick={() => {
                const container = document.getElementById('top-movies-container');
                if (container) container.scrollBy({ left: 300, behavior: 'smooth' });
            }}
            class="absolute right-0 top-1/2 -translate-y-1/2 z-20 flex h-24 w-10 items-center justify-center rounded-l-lg bg-black/60 text-white md:opacity-0 md:group-hover:opacity-100 transition-opacity hover:bg-black/80 cursor-pointer"
        >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="size-6">
                <path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
            </svg>
        </button>

    </div>
</div>
		<!-- แสดงรายชื่อหนัง -->
		<div>
    <div class="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-white/10 pb-4">
        <h2 class="bg-white bg-clip-text text-2xl font-bold text-transparent drop-shadow-sm">
            หมวดหมู่: {currentGenreName}
        </h2>
        <span class="rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-sm text-gray-300 backdrop-blur-md shadow-sm">
            {#if isLoading}
                <span class="animate-pulse">กำลังโหลดข้อมูล...</span>
            {:else}
                พบภาพยนตร์ <span class="font-bold text-white">{movies.length}</span> เรื่อง
            {/if}
        </span>
    </div>

    {#if isLoading}
        <div class="animate-pulse rounded-2xl border border-white/5 bg-white/5 py-20 text-center text-lg text-gray-400 backdrop-blur-sm">
            รอสักครู่นะครับพี่... 🎬
        </div>

    {:else if movies.length > 0}
        <div class="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {#each movies as movie}
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <div
					onclick={() => openMovieDetails(movie.id)}
                    class="group flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/5 shadow-lg backdrop-blur-md transition-all duration-300 hover:-translate-y-2 hover:bg-white/10 hover:border-red-400/50 hover:shadow-[0_0_25px_rgba(248,113,113,0.15)] cursor-pointer"
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
                            class="absolute right-2 top-2 rounded-lg border border-white/20 bg-black/50 px-2.5 py-1 text-xs font-bold text-yellow-400 shadow-sm backdrop-blur-md"
                        >
                            ⭐ IMDB {movie.vote_average ? movie.vote_average.toFixed(1) : 'N/A'}
                        </div>
                    </div>
                    
                    <div class="flex flex-grow flex-col justify-between border-t border-white/5 bg-black/20 p-4 cursor-pointer">
                        <h3 class="mb-1 line-clamp-1 text-sm font-semibold text-white transition-colors group-hover:text-red-500" title={movie.title}>
                            {movie.title}
                        </h3>
                        <p class="line-clamp-2 text-xs leading-relaxed text-gray-400">
                            {movie.overview || 'ไม่มีคำอธิบายเนื้อเรื่องย่อ...'}
                        </p>
                    </div>
                </div>
            {/each}
        </div>
		<div class="my-10 flex items-center justify-center gap-4">
        <!-- ปุ่มหน้าก่อนหน้า -->
        <button
            onclick={() => changePage(currentPage - 1)}
            disabled={currentPage === 1 || isLoading}
            class="rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-semibold text-white backdrop-blur-md transition-all hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer shadow-lg"
        >
            ← ก่อนหน้า
        </button>

        <!-- แสดงเลขหน้า -->
        <span class="text-sm font-medium text-gray-300">
            หน้า <span class="font-bold text-white">{currentPage}</span> / {totalPages}
        </span>

        <!-- ปุ่มหน้าถัดไป -->
        <button
            onclick={() => changePage(currentPage + 1)}
            disabled={currentPage >= totalPages || isLoading}
            class="rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-semibold text-white backdrop-blur-md transition-all hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer shadow-lg"
        >
            ถัดไป →
        </button>
    </div>

    {:else}
        <div class="rounded-2xl border border-white/5 bg-white/5 py-16 text-center text-gray-400 backdrop-blur-sm">
            ไม่พบรายชื่อหนังในหมวดหมู่นี้
        </div>
    {/if}
</div>
		
	</div>
</main>

<!-- 🎬 Modal แสดงผลลัพธ์เมื่อกดสุ่มหนัง -->
{#if isModalOpen && randomMovie}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-md transition-all duration-300">
        <!-- ตัวกล่อง Modal แบบ Glassmorphism -->
        <div
            class="animate-in fade-in zoom-in w-full max-w-xl overflow-hidden rounded-3xl border border-white/10 bg-white/5 shadow-[0_8px_32px_rgba(0,0,0,0.5)] backdrop-blur-2xl duration-200 {isShaking ? 'animate-shake' : ''}"
        >
            <div class="flex flex-col gap-6 p-6 md:flex-row md:p-8">
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
                        
                            <span class="rounded-full border border-yellow-400/30 bg-yellow-500/20 px-3 py-1 text-sm font-bold text-yellow-300 backdrop-blur-md"
                                >⭐ IMDB {randomMovie.vote_average ? randomMovie.vote_average.toFixed(1) : 'N/A'}</span
                            >
                        </div>
                        <h3 class="mb-2 text-2xl font-bold text-white drop-shadow-md">{randomMovie.title}</h3>
                        <p class="mb-4 max-h-40 overflow-y-auto text-sm leading-relaxed text-gray-300">
                            {randomMovie.overview || 'ไม่มีคำอธิบายเนื้อเรื่องย่อสำหรับภาพยนตร์เรื่องนี้'}
                        </p>
                    </div>
					

                    <!-- กลุ่มปุ่มกดแบบ Glassmorphism -->
                    <div class="mt-4 flex gap-3">
                        <!-- ปุ่มสุ่มใหม่ -->
                        <button
                            onclick={pickRandomMovie}
                            class="flex-1 rounded-xl border border-red-500/50 bg-red-500/20 py-3 text-sm font-bold text-red-100 shadow-lg backdrop-blur-md transition-all hover:bg-red-500/40 hover:shadow-[0_0_15px_rgba(239,68,68,0.3)] cursor-pointer"
                        >
                            🎲 ไม่ถูกใจหรอ? สุ่มอีกรอบสิ
                        </button>
                        <!-- ปุ่มปิด -->
                        <button
                            onclick={() => (isModalOpen = false)}
                            class="rounded-xl border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-gray-300 shadow-lg backdrop-blur-md transition-all hover:bg-white/10 hover:text-white cursor-pointer"
                        >
                            ปิด
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>
{/if}

{#if isDetailModalOpen}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md transition-all duration-300">
        <!-- เพิ่ม relative ที่กล่องหลักเพื่อให้ปุ่ม X อ้างอิงตำแหน่งมุมขวาบนได้ถูกต้อง -->
        <div class="relative animate-in fade-in zoom-in w-full max-w-2xl overflow-hidden rounded-3xl border border-white/10 bg-white/5 shadow-[0_8px_32px_rgba(0,0,0,0.5)] backdrop-blur-3xl">
            
<button
    type="button"
    onclick={() => (isDetailModalOpen = false)}
    class="absolute right-3 top-3 z-50 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition-all hover:bg-black/70 active:scale-95 cursor-pointer md:hidden"
    aria-label="Close modal"
>
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="size-5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
    </svg>
</button>

            {#if isDetailLoading}
                <!-- หน้าต่างโหลดข้อมูล -->
                <div class="flex h-64 flex-col items-center justify-center text-gray-400">
                    <span class="mb-4 text-4xl animate-bounce">🍿</span>
                    <p>กำลังโหลดใจเย็น ๆ</p>
                </div>
            {:else if selectedMovieDetails}
                <!-- รายละเอียดหนัง -->
                <div class="flex flex-col md:flex-row max-h-[85vh] overflow-y-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    
                    <!-- โปสเตอร์ด้านซ้าย -->
                    <div class="relative w-full md:w-1/3 flex-shrink-0 bg-black/40">
                        {#if selectedMovieDetails.poster_path}
                            <img
                                src="https://image.tmdb.org/t/p/w500{selectedMovieDetails.poster_path}"
                                alt={selectedMovieDetails.title}
                                class="h-full w-full object-cover"
                            />
                        {:else}
                            <div class="flex h-full min-h-[300px] items-center justify-center text-gray-500">ไม่มีรูปภาพ</div>
                        {/if}
                    </div>

                    <!-- ข้อมูลด้านขวา -->
                    <div class="flex flex-col p-6 md:w-2/3 md:p-8">
                        <div class="mb-2 flex items-center justify-between">
                            <span class="rounded-full border border-yellow-400/30 bg-yellow-500/20 px-3 py-1 text-sm font-bold text-yellow-300">
                                ⭐ IMDB {selectedMovieDetails.vote_average ? selectedMovieDetails.vote_average.toFixed(1) : 'N/A'}
                            </span>
                            <span class="text-sm text-gray-400">{selectedMovieDetails.release_date?.split('-')[0] || 'N/A'}</span>
                        </div>
                        
                        <h2 class="mb-4 text-2xl font-bold text-white md:text-3xl drop-shadow-md">{selectedMovieDetails.title}</h2>
                        
                        <!-- หมวดหมู่ & เวลา -->
                        <div class="mb-6 flex flex-wrap items-center gap-2 text-sm text-gray-300">
                            <!-- ระยะเวลาหนัง -->
                            <span class="flex items-center gap-1 rounded-lg bg-white/10 px-2 py-1">
                                ⏱️ {formatRuntime(selectedMovieDetails.runtime)}
                            </span>
                            <!-- หมวดหมู่ (วนลูปแสดงทุกหมวด) -->
                            {#each selectedMovieDetails.genres as genre}
                                <span class="rounded-lg border border-white/10 bg-white/5 px-2 py-1">
                                    {genre.name}
                                </span>
                            {/each}
                        </div>

                        <!-- คำอธิบายหนัง -->
                        <div class="mb-6 flex-grow">
                            <h4 class="mb-2 text-sm font-semibold text-gray-400">เนื้อเรื่องย่อ</h4>
                            <p class="text-sm leading-relaxed text-gray-300">
                                {selectedMovieDetails.overview || 'ไม่มีคำอธิบายเนื้อเรื่องย่อสำหรับภาพยนตร์เรื่องนี้'}
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
                                    <span class="text-sm text-gray-500 rounded-lg bg-white/5 px-3 py-2 border border-white/5">
                                        ไม่มีข้อมูลสตรีมมิ่งในไทย ว่ะฮ่ะฮ่าาา
                                    </span>
                                {/if}
                            </div>
                        </div>

                        <!-- ปุ่มปิด (ด้านล่างเก็บไว้เหมือนเดิมเผื่อเลือกกด) -->
                        <button
                            type="button"
                            onclick={() => (isDetailModalOpen = false)}
                            class="w-full rounded-xl border border-white/10 bg-white/10 py-3 text-sm font-bold text-white transition-all hover:bg-white/20 active:scale-95 cursor-pointer"
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
        0%, 100% { transform: translateX(0) rotate(0deg); }
        20% { transform: translateX(-6px) rotate(-1.5deg); }
        40% { transform: translateX(6px) rotate(1.5deg); }
        60% { transform: translateX(-4px) rotate(-1deg); }
        80% { transform: translateX(4px) rotate(1deg); }
    }

    .animate-shake {
        animation: shake 0.4s ease-in-out;
    }
</style>