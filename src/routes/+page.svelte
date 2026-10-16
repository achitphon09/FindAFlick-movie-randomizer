<script lang="ts">
	import type { PageProps } from './$types';
	import { onMount } from 'svelte';
	import { tick } from 'svelte';

	let { data }: PageProps = $props(); // รับข้อมูลเริ่มต้นจาก Server
	let genres = $derived(data.genres || []); // รายชื่อหมวดหมู่หนัง (อัปเดตออโต้)
	let movies = $state<any[]>([]); // รายชื่อหนังที่แสดงบนหน้าจอ
	let isLoading = $state(false); // เช็กว่ากำลังโหลดข้อมูลอยู่ไหม
	let randomMovie = $state<any | null>(null); // ข้อมูลหนังที่สุ่มได้
	let isModalOpen = $state(false); // เปิด/ปิด หน้าต่างสุ่มหนัง
	let searchQuery = $state(''); // ข้อความที่พิมพ์ค้นหา
	let isSearching = $state(false); // เช็กว่ากำลังค้นหาอยู่ไหม
	let isDetailModalOpen = $state(false); // เปิด/ปิด หน้าต่างดูรายละเอียดหนัง
	let selectedMovieDetails = $state<any | null>(null); // ข้อมูลรายละเอียดหนังที่กดดู
	let isDetailLoading = $state(false); // กำลังโหลดรายละเอียดหนังไหม
	let isShaking = $state(false); // เอฟเฟกต์หน้าจอตอนกดสุ่ม
	let currentPage = $state(1); // หน้าปัจจุบัน (pagination)
	let totalPages = $state(500); // จำนวนหน้าทั้งหมด (สูงสุด 500)
	let topMovies = $state<any[]>([]); // รายชื่อหนัง Top 10
	let currentSort = $state<string | null>(null); // รูปแบบการเรียงลำดับหนัง
	let selectedGenreId = $state<number | null>(null); // ID หมวดหมู่ที่เลือก (หรือ 99999 สำหรับ Marvel)
	let trailerKey = $state<string | null>(null); // รหัสคลิป YouTube ตัวอย่างหนัง
	let isPlayingTrailer = $state<boolean>(false); // กำลังเล่นตัวอย่างหนังอยู่ไหม
	let randomTrailerKey = $state<string | null>(null); // รหัสคลิป YouTube ของหนังที่สุ่มได้
	let isPlayingRandomMovieTrailer = $state<boolean>(false); // กำลังเล่นตัวอย่างหนังที่สุ่มได้ไหม
	let viewMode = $state<'home' | 'genre' | 'sort' | 'search' | 'provider'>('home'); // สถานะหน้าจอปัจจุบัน
	let selectedProviderId = $state<number | null>(null); // ID แพลตฟอร์มสตรีมมิ่งที่เลือก
	let randomMovieProviders = $state<any[]>([]); // แพลตฟอร์มของหนังที่สุ่มได้
	let dailyMovie = $state<any>(null); // หนังแนะนำประจำวัน
	let castContainer = $state<HTMLElement | null>(null); // กล่องรายชื่อนักแสดง
	let mediaType = $state<'movie' | 'tv'>('movie'); // โหมดปัจจุบัน (หนัง หรือ ซีรีส์)
	let isAnyModalOpen = $derived(isModalOpen || isDetailModalOpen || showWelcomeModal); // เช็กให้แน่ใจว่ามี modal เปิดอยู่ไหม
	let showWelcomeModal = $state(false); // สถานะเปิด/ปิด ป๊อปอัพต้อนรับตอนเข้าเว็บครั้งแรก (ค่าเริ่มต้นเป็น false ไว้ก่อน)
	let isPosterReelSpinning = $state(false); // สถานะกำลังหมุนวงล้อโปสเตอร์
	let spinningPosterMovies = $state<any[]>([]); // อาร์เรย์เก็บรายชื่อหนังสำรองสำหรับทำแอนิเมชัน
	let audioCtx: AudioContext | null = null; //ตัวแปรเสียง

	/* 1.วิ่งไปดึงรายชื่อหนังตามหมวดหมู่ที่เลือกจาก API */
	async function fetchMoviesByGenre(genreId: number, page: number = 1) {
		isLoading = true;
		isSearching = false;
		searchQuery = '';
		selectedGenreId = genreId;
		currentSort = null;
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
	/* 1.วิ่งไปดึงรายชื่อหนังตามหมวดหมู่ที่เลือกจาก API */

	/* 2.พิมพ์ค้นหาหนังจากชื่อที่ผู้ใช้กรอก */
	async function searchMovies(page: number = 1) {
		if (!searchQuery || !searchQuery.trim()) return;

		isLoading = true;
		isSearching = true;
		selectedGenreId = null;
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
	/* 2.พิมพ์ค้นหาหนังจากชื่อที่ผู้ใช้กรอก */

	/* 3.เปลี่ยนหน้าเว็บ (Pagination) แล้วดึงข้อมูลหนังหน้าใหม่ */
	async function changePage(newPage: number) {
		if (newPage < 1 || newPage > totalPages) return; // ป้องกันไม่ให้กดเลยขอบเขตหน้า

		currentPage = newPage; // อัปเดตเลขหน้าปัจจุบัน
		window.scrollTo({ top: 0, behavior: 'smooth' }); // เลื่อนจอขึ้นด้านบนสุดเบาๆ

		// เช็กว่าตอนนี้ผู้ใช้กำลังดูหน้าจอโหมดไหนอยู่ แล้วเรียกฟังก์ชันดึงข้อมูลให้ถูกโหมด
		if (isSearching) {
			// ถ้ากำลังอยู่ในโหมดค้นหา ให้ดึงข้อมูลหน้าใหม่ของการค้นหา
			await searchMovies(currentPage);
		} else {
			// ถ้าอยู่โหมดปกติ (หน้าแรก, หมวดหมู่, แพลตฟอร์ม หรือ Marvel) ให้เรียก applyFilters โหลดหน้าใหม่
			await applyFilters(currentPage);
		}
	}
	/* 3.เปลี่ยนหน้าเว็บ (Pagination) แล้วดึงข้อมูลหนังหน้าใหม่ */

	/* 4.แปลงนาทีหนังให้เป็นรูปแบบ ชั่วโมง/นาที ที่อ่านง่าย */
	function formatRuntime(minutes: number) {
		if (!minutes) return 'ไม่ระบุเวลา';
		const h = Math.floor(minutes / 60);
		const m = minutes % 60;
		return h > 0 ? `${h} ชม. ${m} นาที` : `${m} นาที`;
	}
	/* 4.แปลงนาทีหนังให้เป็นรูปแบบ ชั่วโมง/นาที ที่อ่านง่าย */

	/* 5.คอยเช็กอัตโนมัติ: ถ้ายังไม่ได้เลือกหมวดหมู่ ให้เลือกหมวดหมู่แรกและดึงหนังมาแสดงทันทีตอนเข้าเว็บ */
	$effect(() => {
		if (selectedGenreId === null && genres.length > 0 && !isSearching) {
			selectedGenreId = genres[0].id;
			fetchMoviesByGenre(genres[0].id);
		}
	});

	/* 6.คำนวณชื่อหัวข้อที่จะแสดงบนจออัตโนมัติ (เปลี่ยนตามว่ากำลังค้นหา หรือเลือกหมวดหมู่อะไรอยู่) */
	let currentGenreName = $derived(
		isSearching
			? `ค้นหา: "${searchQuery}"`
			: selectedGenreId === 99999
				? 'Marvel Cinematic Universe'
				: genres.find((g: { id: number }) => g.id === selectedGenreId)?.name || ''
	);

	/* 7.วิ่งไปดึงข้อมูลหนัง Top 10 ประจำวันจาก API */
	async function fetchTopMovies() {
		try {
			const res = await fetch(
				`/api/movies?endpoint=${encodeURIComponent(`/movie/top_rated?language=th-TH&page=1`)}`
			);
			const data = await res.json();
			topMovies = (data.results || []).slice(0, 10);
		} catch (e) {
			console.error('Error fetching top movies:', e);
			topMovies = [];
		}
	}
	/* 7.วิ่งไปดึงข้อมูลหนัง Top 10 ประจำวันจาก API */

	/* 8.เรียกใช้งานตอนโหลดหน้าเว็บ*/
	$effect(() => {
		fetchTopMovies();
	});

	/* 9.กดคลิกเพื่อดึงข้อมูลรายละเอียดของหนังเรื่องนั้นมาแสดงใน Modal */
	async function openMovieDetails(movieId: number) {
		isDetailModalOpen = true;
		isDetailLoading = true;
		selectedMovieDetails = null;
		trailerKey = null;
		isPlayingTrailer = false;

		try {
			const endpoint = `/movie/${movieId}?language=th-TH&append_to_response=videos,watch/providers,credits&include_video_language=th,en,null`;
			const res = await fetch(`/api/movies?endpoint=${encodeURIComponent(endpoint)}`);
			const data = await res.json();

			selectedMovieDetails = data;

			const videos = data.videos?.results || [];
			let trailer =
				videos.find(
					(v: any) => v.site === 'YouTube' && v.type === 'Trailer' && v.iso_639_1 === 'th'
				) ||
				videos.find((v: any) => v.site === 'YouTube' && v.type === 'Trailer') ||
				videos.find((v: any) => v.site === 'YouTube');

			if (trailer && trailer.key) {
				trailerKey = trailer.key;
			}
		} catch (e) {
			console.error('Error fetching movie details:', e);
		} finally {
			isDetailLoading = false;
		}
	}
	/* 9.กดคลิกเพื่อดึงข้อมูลรายละเอียดของหนังเรื่องนั้นมาแสดงใน Modal */

	// 10.ฟังก์ชันปิด Modal แบบล้างค่าทุกอย่าง
	function closeModal() {
		isDetailModalOpen = false;
		isPlayingTrailer = false;
		trailerKey = null;
	}

	/* 11.วิ่งไปดึงลิงก์คลิปตัวอย่าง (Trailer) จาก YouTube ของหนังที่สุ่มได้ */
	async function fetchRandomMovieTrailer(movieId: number) {
		randomTrailerKey = null;
		isPlayingRandomMovieTrailer = false;
		randomMovieProviders = [];

		try {
			const endpoint = `/movie/${movieId}?language=th-TH&append_to_response=videos,watch/providers&include_video_language=th,en,null`;
			const res = await fetch(`/api/movies?endpoint=${encodeURIComponent(endpoint)}`);
			const data = await res.json();
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
			if (data['watch/providers']?.results?.TH?.flatrate) {
				randomMovieProviders = data['watch/providers'].results.TH.flatrate;
			}
		} catch (e) {
			console.error('Error fetching random movie details:', e);
		}
	}
	/* 11.วิ่งไปดึงลิงก์คลิปตัวอย่าง (Trailer) จาก YouTube ของหนังที่สุ่มได้ */

	/* 12.กดปิดหน้าต่าง Modal ของหนังที่สุ่มได้ */
	function closeRandomModal() {
		isModalOpen = false;
		isPlayingRandomMovieTrailer = false;
		randomTrailerKey = null;
		randomMovieProviders = [];
	}
	/* 12.กดปิดหน้าต่าง Modal ของหนังที่สุ่มได้ */

	/* 13.วิ่งไปดึงข้อมูลหนังแนะนำประจำวันมาโชว์ */
	async function loadDailyMovie() {
		const now = new Date();
		const year = now.getFullYear();
		const month = String(now.getMonth() + 1).padStart(2, '0');
		const day = String(now.getDate()).padStart(2, '0');
		const todayStr = `${year}-${month}-${day}`;
		const storedDate = localStorage.getItem('dailyMovieDate_v2');
		const storedMovie = localStorage.getItem('dailyMovieData_v2');

		if (storedDate === todayStr && storedMovie) {
			dailyMovie = JSON.parse(storedMovie);
			return;
		}
		try {
			const seed = year * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
			const page = (seed % 400) + 1;
			const movieIndex = (seed * 7) % 20;
			const endpoint = `/discover/movie?language=th-TH&sort_by=popularity.desc&page=${page}`;
			const res = await fetch(`/api/movies?endpoint=${encodeURIComponent(endpoint)}`);
			const data = await res.json();

			if (data.results && data.results.length > 0) {
				dailyMovie = data.results[movieIndex] || data.results[0];
				localStorage.setItem('dailyMovieDate_v2', todayStr);
				localStorage.setItem('dailyMovieData_v2', JSON.stringify(dailyMovie));
			}
		} catch (error) {
			console.error('Error fetching daily movie:', error);
		}
	}
	/* 13.วิ่งไปดึงข้อมูลหนังแนะนำประจำวันมาโชว์ */

	/* 14.สั่งให้ฟังก์ชันทำงานอัตโนมัติตอนโหลดหน้าเว็บเสร็จ*/
	onMount(() => {
		loadDailyMovie();
	});

	/* 15.สั่งให้แถวหนังเลื่อนไปซ้ายหรือขวาตามปุ่มกด */
	function horizontalScroll(node: HTMLElement) {
		const onWheel = (e: WheelEvent) => {
			if (e.deltaY !== 0) {
				e.preventDefault();
				node.scrollLeft += e.deltaY;
			}
		};

		node.addEventListener('wheel', onWheel, { passive: false });
		return {
			destroy() {
				node.removeEventListener('wheel', onWheel);
			}
		};
	}
	/* 15.สั่งให้แถวหนังเลื่อนไปซ้ายหรือขวาตามปุ่มกด */

	/* 16.สั่งให้แถวนักแสดงเลื่อนไปซ้ายหรือขวา */
	function scrollCast(direction: 'left' | 'right') {
		if (castContainer) {
			const scrollAmount = direction === 'left' ? -200 : 200;
			castContainer.scrollBy({ left: scrollAmount, behavior: 'smooth' });
		}
	}
	/* 16.สั่งให้แถวนักแสดงเลื่อนไปซ้ายหรือขวา */

	/* 17.อัปเดตแพลตฟอร์มสตรีมมิ่ง */
	const streamingPlatforms = [
		{ id: 8, name: 'Netflix', bgColor: 'hover:bg-[#E50914]', activeColor: 'bg-red-600' },
		{ id: 122, name: 'Disney+', bgColor: 'hover:bg-[#BCEFFF]', activeColor: 'bg-blue-600' },
		{ id: 315, name: 'HBO GO', bgColor: 'hover:bg-gray-300', activeColor: 'bg-gray-600' },
		{ id: 119, name: 'Prime Video', bgColor: 'hover:bg-[#0779FF]', activeColor: 'bg-cyan-600' },
		{ id: 191, name: 'iQIYI', bgColor: 'hover:bg-[#00DC5A]', activeColor: 'bg-green-500' },
		{ id: 350, name: 'Apple TV+', bgColor: 'hover:bg-gray-600', activeColor: 'bg-gray-600' }
	];

	/* 18.กรองหนังแบบผสม (เลือกหมวดหมู่ + แพลตฟอร์ม หรือ Marvel พร้อมกัน) */
	async function applyFilters(pageNumber = 1) {
		searchQuery = '';
		currentPage = pageNumber;
		isLoading = true;

		if (selectedGenreId === null && selectedProviderId === null) {
			viewMode = 'home';
		} else if (selectedGenreId !== null) {
			viewMode = 'genre';
		} else if (selectedProviderId !== null) {
			viewMode = 'provider';
		}

		try {
			let endpoint = `/discover/movie?language=th-TH&sort_by=popularity.desc&page=${currentPage}`;

			// ถ้าเลือก Marvel ให้เติม Keyword
			if (selectedGenreId === 99999) {
				endpoint += `&with_keywords=180547`;
			} else if (selectedGenreId) {
				endpoint += `&with_genres=${selectedGenreId}`;
			}

			// ถ้าเลือกแพลตฟอร์มควบคู่ด้วย สามารถใส่พ่วงเข้าไปได้เลยทันที!
			if (selectedProviderId) {
				endpoint += `&watch_region=TH&with_watch_providers=${selectedProviderId}`;
			}

			const res = await fetch(`/api/movies?endpoint=${encodeURIComponent(endpoint)}`);
			const data = await res.json();

			movies = data.results || [];
			totalPages = Math.min(data.total_pages || 1, 500);
		} catch (e) {
			console.error('Error fetching filtered movies:', e);
			movies = [];
		} finally {
			isLoading = false;
		}
	}
	/* 18.กรองหนังแบบผสม (เลือกหมวดหมู่ + แพลตฟอร์ม หรือ Marvel พร้อมกัน) */

	/* 19.กดเลือกหรือยกเลิกหมวดหมู่หนัง */
	function toggleGenre(genreId: number) {
		if (selectedGenreId === genreId) {
			selectedGenreId = null; // ถ้าย้ำปุ่มเดิม = ปิดตัวกรอง
		} else {
			selectedGenreId = genreId; // ถ้ากดปุ่มใหม่ = เลือกหมวดหมู่
		}
		applyFilters(1);
	}
	/* 19.กดเลือกหรือยกเลิกหมวดหมู่หนัง */

	/* 20.กดเลือกหรือยกเลิกแพลตฟอร์มสตรีมมิ่ง */
	function togglePlatform(providerId: number | null) {
		if (providerId === null || selectedProviderId === providerId) {
			selectedProviderId = null;
		} else {
			selectedProviderId = providerId;
		}
		applyFilters(1);
	}
	/* 20.กดเลือกหรือยกเลิกแพลตฟอร์มสตรีมมิ่ง */

	/* 21.สุ่มเลือกหนังเด็ดๆ ขึ้นมา 1 เรื่อง */
	async function pickRandomMovie() {
		// เริ่มต้นเคลียร์ค่าเดิม
		isPlayingRandomMovieTrailer = false;
		randomTrailerKey = null;
		randomMovieProviders = [];

		isPosterReelSpinning = true;
		randomMovie = null; // เคลียร์หนังเก่าออกก่อน เพื่อให้วงล้อแสดงผล
		isModalOpen = true; // เปิด Modal ทันทีตั้งแต่เริ่มสุ่ม
		isShaking = true;
		setTimeout(() => {
			isShaking = false;
		}, 400);

		try {
			// ดึงหนังชุดแรกมาสัก 2 หน้า (ประมาณ 40 เรื่อง) เพื่อเอามาเป็นวัตถุดิบสุ่มหมุน
			let baseEndpoint = `/discover/movie?language=th-TH&sort_by=popularity.desc`;
			// ถ้าเลือกหมวดหมู่/สตรีมมิ่ง ให้ใส่เงื่อนไขตามเดิม
			if (selectedGenreId === 99999) {
				baseEndpoint += `&with_keywords=180547`;
			} else if (selectedGenreId) {
				baseEndpoint += `&with_genres=${selectedGenreId}`;
			}
			if (selectedProviderId) {
				baseEndpoint += `&watch_region=TH&with_watch_providers=${selectedProviderId}`;
			}

			// ดึงข้อมูลหน้า 1 และ 2 มาพร้อมกันเพื่อความหลากหลาย
			const [res1, res2] = await Promise.all([
				fetch(`/api/movies?endpoint=${encodeURIComponent(baseEndpoint + '&page=1')}`),
				fetch(`/api/movies?endpoint=${encodeURIComponent(baseEndpoint + '&page=2')}`)
			]);

			const data1 = await res1.json();
			const data2 = await res2.json();
			const allDummyMovies = [...(data1.results || []), ...(data2.results || [])].filter(
				(m) => m.poster_path
			);

			if (allDummyMovies.length === 0) {
				isPosterReelSpinning = false;
				isModalOpen = false;
				alert(
					'ขอโทษครับเฮีย ขอโทษครับซ้อ ไม่พบหนังที่ตรงกับเงื่อนไขนี้ ลองเปลี่ยนตัวกรองดูใหม่เด้อ'
				);
				return;
			}

			// สุ่มเลือกหนังผู้โชคดีตัวจริงจากรายชื่อทั้งหมด
			const pickedMovieIndex = Math.floor(Math.random() * allDummyMovies.length);
			const finalMovie = allDummyMovies[pickedMovieIndex];

			// สร้างอาร์เรย์หนังสำหรับทำอนิเมชันหมุน: เอาหนังผู้โชคดีไว้ท้ายสุด และสลับหนังเรื่องอื่นมาก่อนหน้า
			// เราจะเอาหนังชุดนี้มาแสดงผลใน Modal แบบหมุนวนๆ
			let reelMoviesForAnimation = [];
			for (let i = 0; i < 15; i++) {
				let randomIndexForReel = Math.floor(Math.random() * allDummyMovies.length);
				reelMoviesForAnimation.push(allDummyMovies[randomIndexForReel]);
			}
			// เอาหนังผู้โชคดีใส่ไว้ท้ายสุดของ Reel เพื่อให้เบรกหยุดตรงนี้
			reelMoviesForAnimation.push(finalMovie);
			spinningPosterMovies = reelMoviesForAnimation;

			// หน่วงเวลา 2.5 วินาที ให้ผู้ใช้ลุ้นกับแอนิเมชันวงล้อหมุนโปสเตอร์
			setTimeout(async () => {
				// ดึงรายละเอียดหนังผู้โชคดีตัวจริงฉบับเต็มจาก TMDB API
				const detailEndpoint = `/movie/${finalMovie.id}?language=th-TH&append_to_response=videos,watch/providers&include_video_language=th,en,null`;
				const detailRes = await fetch(`/api/movies?endpoint=${encodeURIComponent(detailEndpoint)}`);
				const detailData = await detailRes.json();

				// เซ็ตข้อมูลหนังจริงแล้วปิดโหมดหมุนวงล้อ
				randomMovie = detailData;
				isPosterReelSpinning = false;
				isModalOpen = true;

				// จัดการ Trailer และ Provider เหมือนเดิม
				const videos = detailData.videos?.results || [];
				let trailer =
					videos.find(
						(v: any) => v.site === 'YouTube' && v.type === 'Trailer' && v.iso_639_1 === 'th'
					) ||
					videos.find((v: any) => v.site === 'YouTube' && v.type === 'Trailer') ||
					videos.find((v: any) => v.site === 'YouTube');
				if (trailer) randomTrailerKey = trailer.key;
				if (detailData['watch/providers']?.results?.TH?.flatrate) {
					randomMovieProviders = detailData['watch/providers'].results.TH.flatrate;
				}
			}, 2500); // หน่วงเวลา 2.5 วินาทีให้การหมุนดูอลังการ
		} catch (e) {
			isPosterReelSpinning = false;
			isModalOpen = false;
			console.error('Error fetching random movie reel:', e);
		}

		// ตัวอย่างตอนรันสล็อตหมุน
		let tickCount = 0;
		const spinInterval = setInterval(() => {
			playTickSound(); // เล่นเสียงติ๊กทุกๆ จังหวะที่เปลี่ยนภาพ
			tickCount++;
			if (tickCount > 25) {
				// สมมติหมุนครบจำนวนรอบแล้วหยุด
				clearInterval(spinInterval);
				// เล่นเสียงตอนหยุดสำเร็จ (ถ้าต้องการ)
				isPosterReelSpinning = false;
				playVictorySound();
			}
		}, 100);
	}
	/* 21.สุ่มเลือกหนังเด็ดๆ ขึ้นมา 1 เรื่อง */

	/* 22.ล็อค modal ไม่ให้เลื่อนฉากหลังได้ */
	$effect(() => {
		if (typeof document !== 'undefined') {
			if (isAnyModalOpen) {
				document.body.classList.add('overflow-hidden');
			} else {
				document.body.classList.remove('overflow-hidden');
			}
		}
	});
	/* 22.ล็อค modal ไม่ให้เลื่อนฉากหลังได้ */

	/* 23.ป๊อบอัพเข้าเว็บครั้งแรก */
	$effect(() => {
		if (typeof window !== 'undefined') {
			const hasVisited = localStorage.getItem('has_seen_welcome');
			if (!hasVisited) {
				showWelcomeModal = true; // ถ้ายังไม่เคยเข้า ให้เปิดป๊อปอัพ
			}
		}
	});

	// ฟังก์ชันเมื่อผู้ใช้กดปุ่มตกลง
	function closeWelcomeModal() {
		showWelcomeModal = false;
		if (typeof window !== 'undefined') {
			localStorage.setItem('has_seen_welcome', 'true'); // บันทึกว่าดูแล้ว จะได้ไม่เด้งอีก
		}
	}
	/* 23.ป๊อบอัพเข้าเว็บครั้งแรก */

	/* 24.ฟังก์ชั่นบอกรายได้หนัง */
	function formatMoney(amount: number) {
		if (!amount || amount === 0) return 'ไม่เปิดเผยข้อมูล';
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD',
			maximumFractionDigits: 0
		}).format(amount);
	}
	/* 24.ฟังก์ชั่นบอกรายได้หนัง */

	/* 25.ฟังก์ชันสร้างเสียงติ๊กสั้นๆ ตอนสล็อตกำลังหมุน */
	function playTickSound() {
		try {
			const ctx = getAudioContext();
			const oscillator = ctx.createOscillator();
			const gainNode = ctx.createGain();

			oscillator.type = 'triangle';
			oscillator.frequency.setValueAtTime(600, ctx.currentTime);
			oscillator.frequency.exponentialRampToValueAtTime(150, ctx.currentTime + 0.04);

			// ลดความดังลงนิดนึง (จาก 0.1 เหลือ 0.05) เพื่อกันเสียงแตกเวลาลำโพงมือถือหรือคอมเร่งดังๆ
			gainNode.gain.setValueAtTime(0.05, ctx.currentTime);
			gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);

			oscillator.connect(gainNode);
			gainNode.connect(ctx.destination);

			oscillator.start();
			oscillator.stop(ctx.currentTime + 0.04);
		} catch (e) {
			// ข้าม error ถ้าเบราว์เซอร์บล็อก
		}
	}
	/* 25.ฟังก์ชันสร้างเสียงติ๊กสั้นๆ ตอนสล็อตกำลังหมุน */

	/* 26.ฟังก์ชันสร้างเสียงฉลองตอนสุ่มหนังสำเร็จ */
	function playVictorySound() {
		try {
			const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();

			// โน้ตเพลงรัวขึ้นเป็นเสียงฉลอง (C Major Chord: C5, E5, G5, C6)
			const notes = [523.25, 659.25, 783.99, 1046.5];

			notes.forEach((freq, index) => {
				const oscillator = audioCtx.createOscillator();
				const gainNode = audioCtx.createGain();

				oscillator.type = 'sine'; // เสียงนุ่มนวลฟังสบาย
				oscillator.frequency.setValueAtTime(freq, audioCtx.currentTime + index * 0.08);

				// ไล่ระดับความดังและหน่วงเวลาให้ดังไล่เรียงกันไปทีละโน้ต
				gainNode.gain.setValueAtTime(0, audioCtx.currentTime + index * 0.08);
				gainNode.gain.linearRampToValueAtTime(0.2, audioCtx.currentTime + index * 0.08 + 0.02);
				gainNode.gain.exponentialRampToValueAtTime(
					0.001,
					audioCtx.currentTime + index * 0.08 + 0.3
				);

				oscillator.connect(gainNode);
				gainNode.connect(audioCtx.destination);

				// เริ่มเล่นและหยุดตามจังหวะเวลาของแต่ละโน้ต
				oscillator.start(audioCtx.currentTime + index * 0.08);
				oscillator.stop(audioCtx.currentTime + index * 0.08 + 0.3);
			});
		} catch (e) {
			// ป้องกัน Error กรณีที่เบราว์เซอร์บล็อก AudioContext
		}
	}
	/* 26.ฟังก์ชันสร้างเสียงฉลองตอนสุ่มหนังสำเร็จ */

	/* 27.แก้เสียงขาด */
	function getAudioContext() {
		if (!audioCtx) {
			audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
		}
		if (audioCtx.state === 'suspended') {
			audioCtx.resume();
		}
		return audioCtx;
	}
	/* 27.แก้เสียงขาด */
</script>

<svelte:head>
	<title>FindAFlick</title>
</svelte:head>

<main class="min-h-screen bg-black p-8 text-white">
	<div class="mx-auto max-w-6xl">
		<div class="mb-8 text-center">
			<h1 class="mt-6 mb-2 text-5xl font-bold text-red-500">FindAFlick</h1>
			<p class="mb-6 text-xs whitespace-nowrap text-gray-300 sm:text-base md:text-lg">
				อยากดูหนังแต่ไม่รู้จะดูเรื่องไร ให้เราจัดการให้
			</p>

			<!-- ปุ่มสุ่มหนังไฮไลท์ -->
			<button
				onclick={pickRandomMovie}
				disabled={movies.length === 0 || isLoading}
				class="cursor-pointer rounded-full
    			bg-gradient-to-r from-red-500 to-orange-500 px-8 py-4
    			text-lg font-extrabold text-white
    			shadow-[inset_0_3px_6px_rgba(255,255,255,0.4),inset_0_-5px_8px_rgba(0,0,0,0.3),0_12px_25px_rgba(239,68,68,0.4)]
    			transition-all duration-200
    			hover:from-red-400 hover:to-orange-400 hover:shadow-[inset_0_3px_6px_rgba(255,255,255,0.5),inset_0_-5px_8px_rgba(0,0,0,0.3),0_15px_30px_rgba(239,68,68,0.5)]
    			active:translate-y-1.5 active:shadow-[inset_0_2px_3px_rgba(0,0,0,0.3),0_4px_10px_rgba(239,68,68,0.3)]
    			disabled:cursor-not-allowed disabled:opacity-50"
				>ไม่รู้จะดูไร ก็สุ่มดิสุ่มเลยเร็ว!
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
					class="w-full rounded-full border border-white/10 bg-white/5 px-6 py-4 pr-14
					text-white placeholder-gray-400 backdrop-blur-md transition-all focus:border-red-500/50
					focus:bg-white/10 focus:ring-1 focus:ring-red-500/50 focus:outline-none"
				/>

				<!-- ปุ่มกดแว่นขยาย -->
				<!-- svelte-ignore a11y_consider_explicit_label -->
				<button
					type="button"
					onclick={() => searchMovies()}
					class="absolute top-1/2 right-3 flex h-10 w-10 -translate-y-1/2 cursor-pointer
					items-center justify-center rounded-full bg-red-500/20 text-red-400 transition-all
					hover:bg-red-500 hover:text-white"
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

		<!-- แผงควบคุมตัวกรอง -->
		<div>
			<!-- กลุ่มแพลตฟอร์มสตรีมมิ่ง -->
			<div class="flex flex-col gap-4">
				<div class="flex items-center justify-between md:justify-center md:gap-6">
					<h3 class="text-lg font-bold tracking-wide text-white md:text-xl">แพลตฟอร์มสตรีมมิ่ง</h3>

					{#if selectedProviderId || selectedGenreId}
						<button
							type="button"
							onclick={() => {
								togglePlatform(null);
								if (selectedGenreId) toggleGenre(selectedGenreId);
							}}
							class="flex cursor-pointer items-center gap-1.5 rounded-full border
							border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-gray-200
							shadow-[0_4px_12px_rgba(0,0,0,0.1)] backdrop-blur-md transition-all duration-300
							hover:border-white/40 hover:bg-white/20 hover:text-white
							hover:shadow-[0_4px_16px_rgba(255,255,255,0.1)] active:scale-95"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								viewBox="0 0 20 20"
								fill="currentColor"
								class="h-3.5 w-3.5"
							>
								<path
									d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 
									11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z"
								/>
							</svg>
							ล้างตัวกรอง
						</button>
					{/if}
				</div>

				<!-- แถบปุ่มแพลตฟอร์ม -->
				<div
					class="flex scrollbar-none gap-3 overflow-x-auto pb-3 md:flex-wrap md:justify-center md:overflow-visible [&::-webkit-scrollbar]:hidden"
				>
					<!-- ปุ่มรวมทุกแพลตฟอร์ม -->
					<button
						type="button"
						onclick={() => togglePlatform(null)}
						class="flex flex-shrink-0 cursor-pointer items-center gap-2 rounded-2xl border px-5 py-2.5 text-sm font-bold backdrop-blur-md transition-all duration-300 active:scale-95 {selectedProviderId ===
						null
							? 'border-white/40 bg-white/20 text-white shadow-[0_0_20px_rgba(255,255,255,0.15)]'
							: 'border-white/10 bg-white/5 text-gray-400 hover:border-white/30 hover:bg-white/10 hover:text-white'}"
					>
						ทั้งหมด
					</button>

					<!-- ลูปปุ่มแพลตฟอร์ม -->
					{#each streamingPlatforms as platform}
						<button
							type="button"
							onclick={() => togglePlatform(platform.id)}
							class="flex flex-shrink-0 cursor-pointer items-center gap-2 rounded-2xl border px-5 py-2.5 text-sm font-bold backdrop-blur-md transition-all duration-300 active:scale-95
                    {selectedProviderId === platform.id
								? `border-transparent ${platform.activeColor} text-white shadow-[0_0_20px_rgba(255,255,255,0.2)]`
								: `border-white/10 bg-white/5 text-gray-400 ${platform.bgColor} hover:border-white/30 hover:text-white`}"
						>
							{platform.name}
						</button>
					{/each}
				</div>
			</div>

			<!-- เส้นแบ่งสัดส่วน (Divider) -->
			<div class="mx-auto w-3/4 border-t border-white/10 md:w-1/2"></div>

			<!-- กลุ่มหมวดหมู่ภาพยนตร์ -->
			<div class="mt-4 flex flex-col gap-4 md:text-center">
				<h3 class="text-lg font-bold tracking-wide text-white md:text-xl">หมวดหมู่ภาพยนตร์</h3>
				<!-- แถบปุ่มหมวดหมู่ -->
				<div
					class="flex scrollbar-none gap-2.5 overflow-x-auto pb-3 md:flex-wrap md:justify-center md:overflow-visible [&::-webkit-scrollbar]:hidden"
				>
					{#each genres as genre}
						<button
							type="button"
							onclick={() => toggleGenre(genre.id)}
							class="flex-shrink-0 cursor-pointer rounded-2xl border px-4 py-2 text-sm font-semibold backdrop-blur-md transition-all duration-300 active:scale-95 {selectedGenreId ===
							genre.id
								? 'border-red-400 bg-red-600/80 text-white shadow-[0_0_20px_rgba(239,68,68,0.3)]'
								: 'border-white/10 bg-white/5 text-gray-400 hover:border-white/30 hover:bg-white/10 hover:text-white'}"
						>
							{genre.name}
						</button>
					{/each}
					<button
						type="button"
						onclick={() => toggleGenre(99999)}
						class="flex-shrink-0 cursor-pointer rounded-2xl border px-4 py-2 text-sm font-semibold backdrop-blur-md transition-all duration-300 active:scale-95 {selectedGenreId ===
						99999
							? 'border-rose-400 bg-rose-600/90 text-white shadow-[0_0_20px_rgba(245,158,11,0.4)]'
							: 'border-white/10 bg-white/5 text-red-500 hover:border-rose-400/40 hover:bg-rose-500/10'}"
					>
						Marvel Cinematic Universe
					</button>
				</div>
			</div>
		</div>

		<!-- แบนเนอร์หนังแนะนำประจำวัน (แสดงเฉพาะหน้า home) -->
		{#if viewMode === 'home' && dailyMovie}
			<div class="my-8 w-full px-4">
				<h2 class="mb-4 flex items-center gap-2 text-2xl font-bold text-white">วันนี้ดูอะไรดี?</h2>

				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="group relative cursor-pointer overflow-hidden rounded-3xl border
				border-white/10 bg-black/50 shadow-[0_8px_30px_rgba(0,0,0,0.5)] transition-all hover:border-white/20"
					onclick={() => openMovieDetails(dailyMovie.id)}
				>
					<!-- ภาพพื้นหลัง (Backdrop) เบลอและไล่สี -->
					<div class="absolute inset-0 z-0">
						<img
							src={`https://image.tmdb.org/t/p/w1280${dailyMovie.backdrop_path || dailyMovie.poster_path}`}
							alt={dailyMovie.title}
							class="h-full w-full object-cover opacity-40 transition-transform duration-700 group-hover:scale-105"
						/>

						<div
							class="absolute inset-0 bg-gradient-to-t from-black via-black/70 to-transparent"
						></div>
						<div
							class="absolute inset-0 bg-gradient-to-r from-black via-black/80 to-transparent md:via-black/50"
						></div>
					</div>

					<!-- เนื้อหาการ์ด -->
					<div class="relative z-10 flex flex-col gap-6 p-6 md:flex-row md:items-center md:p-8">
						<!-- โปสเตอร์ (ซ่อนในมือถือ โชว์ในจอใหญ่) -->
						<div
							class="hidden w-32 flex-shrink-0 overflow-hidden rounded-xl border border-white/10 shadow-2xl md:block md:w-44"
						>
							<img
								src={`https://image.tmdb.org/t/p/w500${dailyMovie.poster_path}`}
								alt={dailyMovie.title}
								class="h-full w-full object-cover"
							/>
						</div>

						<!-- รายละเอียด -->
						<div class="flex flex-col justify-center">
							<div class="mb-3">
								<span
									class="inline-block rounded-full bg-red-600 px-3 py-1 text-xs font-bold text-white shadow-lg shadow-red-500/30 backdrop-blur-md"
								>
									Pick Of The Day 🍿
								</span>
							</div>
							<h3 class="mb-2 text-3xl font-bold text-white drop-shadow-md md:text-4xl">
								{dailyMovie.title}
							</h3>

							<div class="mb-4 flex items-center gap-3 text-sm text-gray-300">
								<span
									class="rounded-md bg-white/10 px-2 py-0.5 font-bold text-yellow-400 backdrop-blur-sm"
								>
									⭐ IMDB {dailyMovie.vote_average?.toFixed(1) || 'N/A'}
								</span>
								<span>•</span>
								<span>{dailyMovie.release_date?.split('-')[0] || 'N/A'}</span>
							</div>

							<p
								class="mb-4 line-clamp-3 max-w-3xl text-sm leading-relaxed text-gray-300 md:text-base"
							>
								{dailyMovie.overview || 'ไม่มีคำอธิบายเนื้อเรื่องย่อสำหรับภาพยนตร์เรื่องนี้'}
							</p>

							<div>
								<button
									class="cursor-pointer rounded-xl bg-white px-6 py-2.5 text-sm font-bold text-black shadow-lg transition-all hover:bg-gray-200 active:scale-95"
								>
									ดูรายละเอียด
								</button>
							</div>
						</div>
					</div>
				</div>
			</div>
		{/if}

		<!--Top 10 หนังแบบเรียลไทม์-->
		{#if viewMode == 'home'}
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
						class="absolute top-1/2 left-0 z-20 hidden h-24 w-10 -translate-y-1/2 cursor-pointer
						items-center justify-center rounded-r-lg bg-black/60 text-white opacity-0 transition-opacity
						group-hover:opacity-100 hover:bg-black/80 md:flex"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							fill="none"
							viewBox="0 0 24 24"
							stroke-width="2.5"
							stroke="currentColor"
							class="size-6"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M15.75 19.5 8.25 12l7.5-7.5"
							/>
						</svg>
					</button>

					<!-- แถวเลื่อนดูหนัง (กำหนด id ไว้สำหรับสั่งเลื่อน) -->
					<div
						id="top-movies-container"
						class="flex [scrollbar-width:none] scrollbar-none gap-4 overflow-x-auto scroll-smooth pt-4 pb-4 pl-6 [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
					>
						{#each topMovies as movie, index}
							<!-- svelte-ignore a11y_click_events_have_key_events -->
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<div
								class="group/item relative max-w-[130px] min-w-[130px] shrink-0 cursor-pointer sm:max-w-[150px] sm:min-w-[150px]"
								onclick={() => openMovieDetails(movie.id)}
							>
								<span
									class="pointer-events-none absolute -bottom-3 -left-4 z-10 bg-gradient-to-r from-red-600 to-orange-600
								bg-clip-text text-7xl font-black text-transparent italic drop-shadow-[0_4px_4px_rgba(0,0,0,0.8)]
								transition-transform group-hover/item:scale-105 sm:text-8xl"
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

					<!-- ปุ่มเลื่อนขวา -->
					<!-- svelte-ignore a11y_consider_explicit_label -->
					<button
						type="button"
						onclick={() => {
							const container = document.getElementById('top-movies-container');
							if (container) container.scrollBy({ left: 300, behavior: 'smooth' });
						}}
						class="absolute top-1/2 right-0 z-20 flex h-24 w-10 -translate-y-1/2 cursor-pointer items-center justify-center
						rounded-l-lg bg-black/60 text-white transition-opacity hover:bg-black/80 md:opacity-0 md:group-hover:opacity-100"
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
		{/if}

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
						<span class="animate-pulse">กำลังโหลดข้อมูลครับเฮีย...</span>
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
							class="group flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-white/10
							bg-white/5 shadow-lg backdrop-blur-md transition-all duration-300 hover:-translate-y-2
							hover:border-red-400/50 hover:bg-white/10 hover:shadow-[0_0_25px_rgba(248,113,113,0.15)]"
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
									{movie.overview || 'ยังไม่มีคำอธิบายเนื้อเรื่องย่อ...'}
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
						class="flex flex-1 cursor-pointer items-center justify-center rounded-xl border border-white/10
						bg-white/5 px-4 py-2.5 text-sm font-semibold text-white shadow-lg backdrop-blur-md transition-all
						hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30 md:flex-none md:px-5"
					>
						← ก่อนหน้า
					</button>

					<!-- ช่องกรอกเลขหน้าเพื่อกระโดดข้าม -->
					<form
						onsubmit={(e) => {
							e.preventDefault();
							const formData = new FormData(e.currentTarget);
							const pageNumber = parseInt(formData.get('pageInput') as string);

							if (pageNumber >= 1 && pageNumber <= totalPages && pageNumber !== currentPage) {
								changePage(pageNumber);
							} else {
								(e.currentTarget.elements.namedItem('pageInput') as HTMLInputElement).value =
									currentPage.toString();
							}
						}}
						class="order-first mb-1 flex w-full items-center justify-center gap-2 rounded-xl border border-white/10
						bg-white/5 px-3 py-2 backdrop-blur-md transition-all hover:border-white/20 md:order-none md:mb-0 md:w-auto md:py-1.5"
					>
						<span class="text-sm font-medium text-gray-300">หน้า</span>
						<input
							name="pageInput"
							type="number"
							min="1"
							max={totalPages}
							value={currentPage}
							title="พิมพ์เลขหน้าแล้วกด Enter"
							class="w-16 rounded-md border border-white/20 bg-black/40 py-1 text-center text-sm
							font-bold text-white transition-all outline-none focus:border-red-500 focus:bg-black focus:ring-1
							focus:ring-red-500 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
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
						class="flex flex-1 cursor-pointer items-center justify-center rounded-xl border border-white/10
						bg-white/5 px-4 py-2.5 text-sm font-semibold text-white shadow-lg backdrop-blur-md transition-all
						hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30 md:flex-none md:px-5"
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

<!-- Modal แสดงผลลัพธ์เมื่อกดสุ่มหนัง -->
{#if isModalOpen}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-md transition-all duration-300"
		onclick={(e) => {
			if (e.target === e.currentTarget) closeRandomModal();
		}}
	>
		<!-- ตัวกล่อง Modal -->
		<div
			class="animate-in fade-in zoom-in relative w-full max-w-xl
            overflow-hidden rounded-3xl border border-white/10 bg-white/5
            shadow-[0_8px_32px_rgba(0,0,0,0.5)] backdrop-blur-2xl duration-200
            {isShaking ? 'animate-shake' : ''}"
		>
			<!-- ปุ่มปิด X มุมขวาบน (เฉพาะมือถือ) -->
			<button
				type="button"
				onclick={closeRandomModal}
				class="absolute top-3 right-3 z-50 flex h-10 w-10 cursor-pointer
                items-center justify-center rounded-full bg-black/50 text-white
                backdrop-blur-sm transition-all hover:bg-black/70 active:scale-95 md:hidden"
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
				<!-- เล่นตัวอย่างหนัง YouTube -->
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
						>
						</iframe>

						<button
							type="button"
							onclick={() => (isPlayingRandomMovieTrailer = false)}
							class="absolute top-2 right-2 z-10 cursor-pointer rounded-full bg-black/70 px-3 py-1
                            text-xs font-bold text-white backdrop-blur-sm hover:bg-black"
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
						<!-- กรณีที่กำลังหมุนวงล้อโปสเตอร์ -->
						{#if isPosterReelSpinning && spinningPosterMovies.length > 0}
							<div class="relative h-full w-full overflow-hidden">
								<div
									class="animate-poster-reel absolute top-0 flex h-full w-full flex-col"
									style="animation-duration: 2.5s;"
								>
									{#each spinningPosterMovies as dummyMovie}
										<img
											src="https://image.tmdb.org/t/p/w500{dummyMovie.poster_path}"
											alt="Loading Poster"
											class="h-full w-full flex-shrink-0 object-cover"
										/>
									{/each}
								</div>
								<div
									class="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/50"
								></div>
							</div>

							<!-- กรณีปกติ (หลังสุ่มเสร็จแล้ว) -->
						{:else if randomMovie}
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
						{:else}
							<div
								class="flex h-full animate-pulse items-center justify-center text-xs text-gray-500"
							>
								กำลังสุ่ม...
							</div>
						{/if}
					</div>

					<!-- รายละเอียดหนัง (แสดงเฉพาะตอนสุ่มเสร็จและมีข้อมูล randomMovie แล้วเท่านั้น) -->
					<div class="flex flex-grow flex-col justify-between text-left">
						{#if randomMovie}
							<div>
								<div class="mb-3 flex items-start justify-between">
									<span
										class="rounded-full border border-yellow-400/30 bg-yellow-500/20 px-3 py-1 text-sm font-bold text-yellow-300 backdrop-blur-md"
									>
										⭐ IMDB {randomMovie.vote_average ? randomMovie.vote_average.toFixed(1) : 'N/A'}
									</span>
								</div>
								<h3 class="mb-2 text-2xl font-bold text-white drop-shadow-md">
									{randomMovie.title}
								</h3>
								<p class="mb-4 max-h-36 overflow-y-auto text-sm leading-relaxed text-gray-300">
									{randomMovie.overview || 'ไม่มีคำอธิบายเนื้อเรื่องย่อสำหรับภาพยนตร์เรื่องนี้'}
								</p>
							</div>

							<!-- ส่วนแสดงแพลตฟอร์มสตรีมมิ่ง -->
							{#if randomMovieProviders.length > 0}
								<div
									class="mb-4 rounded-xl border border-white/10 bg-black/20 p-3 backdrop-blur-sm"
								>
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

							<!-- ปุ่มกดดูตัวอย่างหนัง -->
							{#if randomTrailerKey && !isPlayingRandomMovieTrailer}
								<button
									type="button"
									onclick={() => (isPlayingRandomMovieTrailer = true)}
									class="mb-4 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl
                                    bg-red-600/90 py-2.5 text-sm font-bold text-white shadow-lg shadow-red-600/30 transition-all
                                    hover:bg-red-600 active:scale-95"
								>
									<span>ชมตัวอย่างภาพยนตร์ (Trailer)</span>
								</button>
							{/if}
						{:else}
							<!-- ข้อความระหว่างรอกำลังหมุนสล็อต -->
							<div class="flex h-full items-center justify-center py-10">
								<p class="animate-pulse text-lg font-bold text-white">
									กำลังสุ่มหาภาพยนตร์ให้ ใจเย็น ๆ
								</p>
							</div>
						{/if}

						<!-- ปุ่มสุ่มใหม่ (แสดงตลอดเวลา) -->
						<div class="mt-2 flex gap-3">
							<button
								onclick={() => {
									isPlayingRandomMovieTrailer = false;
									pickRandomMovie();
								}}
								class="relative flex-1 cursor-pointer rounded-2xl
    							bg-gradient-to-b from-red-500 to-red-700 px-4 py-3.5
    							text-sm font-extrabold text-white
    							shadow-[inset_0_2px_4px_rgba(255,255,255,0.4),inset_0_-4px_6px_rgba(0,0,0,0.3),0_10px_20px_rgba(229,9,20,0.4)]
    							transition-all duration-200
    							hover:from-red-400 hover:to-red-600 hover:shadow-[inset_0_2px_4px_rgba(255,255,255,0.5),inset_0_-4px_6px_rgba(0,0,0,0.3),0_12px_25px_rgba(229,9,20,0.6)]
    							active:translate-y-1 active:shadow-[inset_0_2px_2px_rgba(0,0,0,0.3),0_4px_10px_rgba(229,9,20,0.3)]
    							{isShaking ? 'animate-shake' : ''}"
							>
								<!-- ข้อความและไอคอน -->
								<span
									class="relative z-10 flex items-center justify-center gap-2 drop-shadow-[0_2px_2px_rgba(0,0,0,0.3)]"
								>
									<span>ไม่ถูกใจหรอ? สุ่มใหม่อีกที!</span>
								</span>
							</button>

							<button
								onclick={closeRandomModal}
								class="cursor-pointer rounded-xl border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-gray-300 shadow-lg
                                backdrop-blur-md transition-all hover:bg-white/10 hover:text-white active:scale-95"
							>
								ปิด
							</button>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>

	<!-- โปสเตอร์ใน Modal -->
	<div
		class="mx-auto aspect-[2/3] w-36 flex-shrink-0 overflow-hidden rounded-xl border border-white/10 bg-black/40 shadow-xl md:w-48"
	>
		<!-- กรณีที่กำลังหมุนวงล้อโปสเตอร์ -->
		{#if isPosterReelSpinning && spinningPosterMovies.length > 0}
			<div class="relative h-full w-full overflow-hidden">
				<div
					class="animate-poster-reel absolute top-0 flex h-full w-full flex-col"
					style="animation-duration: 2.5s;"
				>
					{#each spinningPosterMovies as dummyMovie, index}
						<img
							src="https://image.tmdb.org/t/p/w500{dummyMovie.poster_path}"
							alt="Loading Poster"
							class="h-full w-full flex-shrink-0 object-cover"
						/>
					{/each}
				</div>
				<!-- เงาสะท้อนนิดหน่อยตอนหมุน -->
				<div
					class="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/50"
				></div>
			</div>

			<!-- กรณีปกติ (หลังสุ่มเสร็จแล้ว) หรือตอนโหลดรายละเอียดหนัง -->
		{:else if randomMovie}
			{#if randomMovie.poster_path}
				<img
					src="https://image.tmdb.org/t/p/w500{randomMovie.poster_path}"
					alt={randomMovie.title}
					class="h-full w-full object-cover"
				/>
			{:else}
				<div class="flex h-full items-center justify-center text-xs text-gray-500">ไม่มีรูปภาพ</div>
			{/if}

			<!-- กรณีที่กำลังโหลดหนังผู้โชคดีอยู่ (ก่อน Modal จะแสดง) -->
		{:else}
			<div class="flex h-full animate-pulse items-center justify-center text-xs text-gray-500">
				กำลังสุ่ม...
			</div>
		{/if}
	</div>
{/if}

{#if isDetailModalOpen}
	<!-- Backdrop คลิกพื้นหลังเพื่อปิด Modal ได้ -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md transition-all duration-300"
		onclick={(e) => {
			if (e.target === e.currentTarget) closeModal();
		}}
	>
		<div
			class="animate-in fade-in zoom-in relative flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden
		rounded-3xl border border-white/10 bg-white/5 shadow-[0_8px_32px_rgba(0,0,0,0.5)] backdrop-blur-3xl"
		>
			<!-- ปุ่มปิด X มุมขวาบน (แสดงเฉพาะบนมือถือ) -->
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
				<!-- ส่วนเนื้อหาข้อมูลหนัง (เลื่อนดูได้เฉพาะส่วนนี้เมื่อเนื้อหายาว) -->
				<div
					class="flex flex-1 [scrollbar-width:none] flex-col overflow-y-auto [-ms-overflow-style:none] md:flex-row [&::-webkit-scrollbar]:hidden"
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
							<span class="text-sm text-gray-400">
								{selectedMovieDetails.release_date?.split('-')[0] || 'N/A'}
							</span>
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

						<!-- รายได้ -->
						<div class="mb-4 grid grid-cols-2 gap-3">
							<div class="rounded-xl border border-white/10 bg-black/20 p-3 backdrop-blur-sm">
								<h4 class="text-[11px] font-semibold text-gray-400">ทุนสร้าง (Budget)</h4>
								<p class="mt-1 text-xs font-bold text-white">
									{formatMoney(selectedMovieDetails.budget)}
								</p>
							</div>
							<div class="rounded-xl border border-white/10 bg-black/20 p-3 backdrop-blur-sm">
								<h4 class="text-[11px] font-semibold text-gray-400">รายได้ (Revenue)</h4>
								<p class="mt-1 text-xs font-bold text-emerald-300">
									{formatMoney(selectedMovieDetails.revenue)}
								</p>
							</div>
						</div>

						<!-- ตัวอย่างหนัง YouTube -->
						{#if isPlayingTrailer && trailerKey}
							<div
								class="relative isolate mb-4 aspect-video w-full translate-z-0 transform overflow-hidden rounded-2xl border border-white/10 bg-black shadow-2xl"
								style="mask-image: radial-gradient(white, black); -webkit-mask-image: -webkit-radial-gradient(white, black);"
							>
								<iframe
									src={`https://www.youtube.com/embed/${trailerKey}?autoplay=1`}
									title="Movie Trailer"
									class="h-full w-full rounded-2xl border-0"
									allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
									allowfullscreen
								>
								</iframe>

								<button
									type="button"
									onclick={() => (isPlayingTrailer = false)}
									class="absolute top-2 right-2 z-10 cursor-pointer rounded-full bg-black/70 px-3 py-1 text-xs font-bold text-white backdrop-blur-sm hover:bg-black"
								>
									✕ ปิดตัวอย่างหนัง
								</button>
							</div>
						{:else if trailerKey}
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

						<!-- แพลตฟอร์มสตรีมมิ่ง -->
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

						<!-- นักแสดงนำ -->
						{#if selectedMovieDetails?.credits?.cast && selectedMovieDetails.credits.cast.length > 0}
							<div class="mt-2 border-t border-white/10 pt-4">
								<div class="mb-3 flex items-center justify-between">
									<h4 class="text-sm font-semibold text-gray-300">นักแสดงนำ</h4>

									<!-- ปุ่มลูกศรเลื่อนซ้าย-ขวา (แสดงเฉพาะ Desktop) -->
									<div class="hidden items-center gap-1 md:flex">
										<button
											type="button"
											onclick={() => scrollCast('left')}
											class="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full
											border border-white/10 bg-white/5 text-xs text-gray-300 transition-all
											hover:bg-white/20 hover:text-white active:scale-95"
											title="เลื่อนซ้าย"
										>
											◀
										</button>
										<button
											type="button"
											onclick={() => scrollCast('right')}
											class="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full
											border border-white/10 bg-white/5 text-xs text-gray-300 transition-all
											hover:bg-white/20 hover:text-white active:scale-95"
											title="เลื่อนขวา"
										>
											▶
										</button>
									</div>
								</div>

								<!-- ใส่ bind:this และ use:horizontalScroll เพื่อให้หมุนลูกกลิ้งเมาส์เลื่อนข้างได้ -->
								<div
									bind:this={castContainer}
									use:horizontalScroll
									class="flex cursor-grab scrollbar-none gap-4 overflow-x-auto scroll-smooth pb-2 active:cursor-grabbing [&::-webkit-scrollbar]:hidden"
								>
									{#each selectedMovieDetails.credits.cast.slice(0, 10) as actor}
										<div
											class="flex w-20 flex-shrink-0 flex-col items-center text-center select-none"
										>
											<div
												class="mb-2 h-16 w-16 overflow-hidden rounded-full border border-white/10 bg-black/40 shadow-md"
											>
												{#if actor.profile_path}
													<img
														src={`https://image.tmdb.org/t/p/w185${actor.profile_path}`}
														alt={actor.name}
														class="h-full w-full object-cover transition-transform duration-300 hover:scale-110"
														loading="lazy"
													/>
												{:else}
													<div
														class="flex h-full w-full items-center justify-center text-xl text-gray-500"
													>
														👤
													</div>
												{/if}
											</div>
											<span
												class="line-clamp-1 w-full text-xs font-bold text-white"
												title={actor.name}
											>
												{actor.name}
											</span>
											<span
												class="line-clamp-1 w-full text-[10px] text-gray-400"
												title={actor.character}
											>
												{actor.character || 'นักแสดง'}
											</span>
										</div>
									{/each}
								</div>
							</div>
						{/if}
					</div>
				</div>

				<!-- ส่วน Footer ล็อกปุ่มปิดให้อยู่ด้านล่างสุดตลอดเวลา (Pinned Footer) -->
				<div class="flex-shrink-0 border-t border-white/10 bg-black/40 p-4 backdrop-blur-md md:p-5">
					<button
						type="button"
						onclick={closeModal}
						class="w-full cursor-pointer rounded-xl border border-white/10 bg-white/10 py-3 text-sm font-bold text-white shadow-lg backdrop-blur-md transition-all hover:bg-white/20 active:scale-95"
					>
						ปิดหน้าต่าง
					</button>
				</div>
			{/if}
		</div>
	</div>
{/if}

{#if showWelcomeModal}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md transition-all duration-300"
	>
		<div
			class="animate-in fade-in zoom-in relative w-full max-w-sm overflow-hidden
            rounded-3xl border border-white/20 bg-white/10 p-5
            text-center shadow-[0_8px_32px_rgba(0,0,0,0.5)] backdrop-blur-2xl duration-200 sm:max-w-md sm:p-8"
		>
			<div
				class="pointer-events-none absolute -top-24 -left-24 h-48 w-48 rounded-full bg-red-500/20 blur-3xl"
			></div>

			<div class="relative z-10">
				<div
					class="mb-1 text-3xl font-extrabold tracking-wider text-[#E50914] drop-shadow-[0_2px_10px_rgba(229,9,20,0.4)] sm:text-4xl"
				>
					FindAFlick
				</div>
				<div
					class="mb-3 text-[11px] font-medium tracking-widest text-gray-400 uppercase sm:text-xs"
				>
					by Sammy
				</div>

				<h2 class="mb-2 text-lg font-bold text-white drop-shadow-md sm:text-2xl">
					สวัสดีครับอาเฮีย อาซ้อ อาซิ้ม อาหมวย
				</h2>

				<p class="mb-5 text-xs leading-relaxed text-gray-300 sm:mb-6 sm:text-sm">
					เว็บไซต์นี้สร้างขึ้นมาเพื่อแก้ pain point
					ของคนที่อยากดูหนังแต่ไม่รู้จะดูเรื่องอะไรดีในชีวิต และแก้ปัญหาคนตัดสินใจยาก โดยจะใช้การ <span
						class="font-bold text-red-400">"สุ่มหนัง"</span
					>แบบแยกเป็นหมวดหมู่ เพื่อการตัดสินใจที่ง่ายขึ้นมั้ง (อันนี้มั่ว)
				</p>

				<h2 class="text-md mb-2 font-bold text-red-500 drop-shadow-md sm:text-2xl">
					*** ไม่ใช่เว็บดูหนังเถื่อนโว้ยยย ***
				</h2>

				<button
					type="button"
					onclick={closeWelcomeModal}
					class="w-full cursor-pointer rounded-2xl border border-red-500/50 bg-gradient-to-r from-red-600 to-red-700 py-3 text-xs font-bold text-white shadow-[0_4px_20px_rgba(229,9,20,0.4)] transition-all hover:from-red-500 hover:to-red-600 hover:shadow-[0_4px_25px_rgba(229,9,20,0.6)] active:scale-95 sm:py-3.5 sm:text-sm"
				>
					เข้าใจแล้ว, ทราบแล้วเปลี่ยน
				</button>
			</div>
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

	/* แปลง keyframes ของวงล้อโปสเตอร์ให้เป็น CSS ปกติ */
	@keyframes poster-reel {
		0% {
			transform: translateY(0%);
		}
		95%,
		100% {
			transform: translateY(-1500%); /* (16 รูป - 1) * 100% = -1500% */
		}
	}

	.animate-poster-reel {
		animation: poster-reel 2.5s cubic-bezier(0.15, 0.85, 0.35, 1) forwards;
	}
</style>
