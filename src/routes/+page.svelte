<script lang="ts">
	import type { PageProps } from './$types';
	import { onMount } from 'svelte';
	import { fade, fly } from 'svelte/transition';

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
	let showWelcomeModal = $state(false); // สถานะเปิด/ปิด ป๊อปอัพต้อนรับตอนเข้าเว็บครั้งแรก
	let isPosterReelSpinning = $state(false); // สถานะกำลังหมุนวงล้อโปสเตอร์
	let spinningPosterMovies = $state<any[]>([]); // อาร์เรย์เก็บรายชื่อหนังสำรองสำหรับทำแอนิเมชัน
	let audioCtx: AudioContext | null = null; // ตัวแปรเสียง
	let lastPickedMovie = $state<any>(null); // ตัวแปรเก็บข้อมูลหนังที่สุ่มได้ล่าสุด
	const apiCache = new Map<string, any>(); // ตัวแปรเก็บ Cache ชั่วคราว (กันยิง API ซ้ำ)

	// คลังหนัง & โหมด Swipe
	let savedMovies = $state<any[]>([]); // เก็บหนังที่ปัดขวา
	let isWatchlistOpen = $state(false); // เปิด/ปิด หน้าต่างคลังหนัง
	let isSwipeModeOpen = $state(false); // เปิด/ปิด หน้าต่าง Swipe Mode

	// ระบบ Desktop Hero Carousel
	let currentSlide = $state(0);
	let isCarouselHovered = $state(false);
	let carouselMovies = $derived(topMovies.slice(0, 5)); // ดึง 5 เรื่องแรกของ Top 10 มาทำสไลด์
	let isCarouselPlayingTrailer = $state(false);
	let carouselTrailerKey = $state<string | null>(null);
	let isLoadingCarouselTrailer = $state(false);

	let isMobileSidebarOpen = $state(false); // สถานะเปิด/ปิด Sidebar บนมือถือ
	let isAnyModalOpen = $derived(
		isModalOpen ||
			isDetailModalOpen ||
			showWelcomeModal ||
			isSwipeModeOpen ||
			isWatchlistOpen ||
			isMobileSidebarOpen
	); // อัปเดตตัวแปรเดิมให้ล็อก Scroll พื้นหลังตอนเปิด Sidebar ด้วย

	/* 1. วิ่งไปดึงรายชื่อหนังตามหมวดหมู่ที่เลือกจาก API */
	async function fetchMoviesByGenre(genreId: number, page: number = 1) {
		isLoading = true;
		isSearching = false;
		searchQuery = '';
		selectedGenreId = genreId;
		currentSort = null;
		currentPage = page;

		const cacheKey = `genre_${mediaType}_${genreId}_page_${page}`;

		if (apiCache.has(cacheKey)) {
			const cachedData = apiCache.get(cacheKey);
			movies = cachedData.results || [];
			totalPages = cachedData.total_pages > 500 ? 500 : cachedData.total_pages || 1;
			isLoading = false;
			return;
		}

		try {
			const endpoint = `/discover/${mediaType}?with_genres=${genreId}&language=th-TH&page=${page}`;
			const res = await fetch(`/api/movies?endpoint=${encodeURIComponent(endpoint)}`);
			const data = await res.json();
			apiCache.set(cacheKey, data);
			movies = data.results || [];
			totalPages = data.total_pages > 500 ? 500 : data.total_pages || 1;
		} catch (e) {
			console.error('Error fetching movies by genre:', e);
			movies = [];
		} finally {
			isLoading = false;
		}
	}

	/* 2. พิมพ์ค้นหาหนังจากชื่อที่ผู้ใช้กรอก */
	async function searchMovies(page: number = 1) {
		if (!searchQuery || !searchQuery.trim()) {
			searchQuery = '';
			isSearching = false;
			await applyFilters(1);
			return;
		}

		isLoading = true;
		isSearching = true;
		selectedGenreId = null;
		currentPage = page;

		try {
			const searchEndpoint = `/search/${mediaType}?language=th-TH&query=${encodeURIComponent(searchQuery)}&page=${page}`;
			const res = await fetch(`/api/movies?endpoint=${encodeURIComponent(searchEndpoint)}`);
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

	/* 3. เปลี่ยนหน้าเว็บ (Pagination) แล้วดึงข้อมูลหนังหน้าใหม่ */
	async function changePage(newPage: number) {
		if (newPage < 1 || newPage > totalPages) return;

		currentPage = newPage;
		window.scrollTo({ top: 0, behavior: 'smooth' });

		if (isSearching) {
			await searchMovies(currentPage);
		} else {
			await applyFilters(currentPage);
		}
	}

	/* 4. แปลงนาทีหนังให้เป็นรูปแบบ ชั่วโมง/นาที ที่อ่านง่าย */
	function formatRuntime(minutes: number) {
		if (!minutes) return 'ไม่ระบุเวลา';
		const h = Math.floor(minutes / 60);
		const m = minutes % 60;
		return h > 0 ? `${h} ชม. ${m} นาที` : `${m} นาที`;
	}

	/* 5. คำนวณชื่อหัวข้อที่จะแสดงบนจออัตโนมัติ */
	let currentGenreName = $derived(
		isSearching
			? `ค้นหา: "${searchQuery}"`
			: selectedGenreId === 99999
				? 'Marvel Cinematic Universe'
				: genres.find((g: { id: number }) => g.id === selectedGenreId)?.name || 'ยอดนิยม'
	);

	/* 6. วิ่งไปดึงข้อมูลหนัง/ซีรีส์ Top 10 ประจำวันจาก API */
	async function fetchTopMovies() {
		try {
			const res = await fetch(
				`/api/movies?endpoint=${encodeURIComponent(`/${mediaType}/top_rated?language=th-TH&page=1`)}`
			);
			const data = await res.json();
			topMovies = (data.results || []).slice(0, 10);
		} catch (e) {
			console.error('Error fetching top movies:', e);
			topMovies = [];
		}
	}

	/* 7. เรียกใช้งานตอนโหลดหน้าเว็บและเมื่อ mediaType เปลี่ยน */
	$effect(() => {
		fetchTopMovies();
	});

	/* 8. กดคลิกเพื่อดึงข้อมูลรายละเอียดของหนังเรื่องนั้นมาแสดงใน Modal */
	async function openMovieDetails(movieId: number, itemType?: 'movie' | 'tv') {
		isDetailModalOpen = true;
		isDetailLoading = true;
		selectedMovieDetails = null;
		trailerKey = null;
		isPlayingTrailer = false;

		try {
			const currentMediaType = itemType || mediaType;
			const endpoint = `/${currentMediaType}/${movieId}?language=th-TH&append_to_response=videos,watch/providers,credits&include_video_language=th,en,null`;
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

	/* 9. ฟังก์ชันปิด Detail Modal แบบล้างค่าทุกอย่าง */
	function closeModal() {
		isDetailModalOpen = false;
		isPlayingTrailer = false;
		trailerKey = null;
	}

	/* 10. กดปิดหน้าต่าง Modal ของหนังที่สุ่มได้ */
	function closeRandomModal() {
		isModalOpen = false;
		isPlayingRandomMovieTrailer = false;
		randomTrailerKey = null;
		randomMovieProviders = [];
	}

	/* 11. วิ่งไปดึงข้อมูลหนัง/ซีรีส์แนะนำประจำวันมาโชว์ */
	async function loadDailyMovie() {
		const now = new Date();
		const year = now.getFullYear();
		const month = String(now.getMonth() + 1).padStart(2, '0');
		const day = String(now.getDate()).padStart(2, '0');
		const todayStr = `${year}-${month}-${day}`;

		const storageKeyDate = `dailyMovieDate_${mediaType}_v2`;
		const storageKeyData = `dailyMovieData_${mediaType}_v2`;

		const storedDate = localStorage.getItem(storageKeyDate);
		const storedMovie = localStorage.getItem(storageKeyData);

		if (storedDate === todayStr && storedMovie) {
			dailyMovie = JSON.parse(storedMovie);
			return;
		}
		try {
			const seed = year * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
			const page = (seed % 400) + 1;
			const movieIndex = (seed * 7) % 20;

			const endpoint = `/discover/${mediaType}?language=th-TH&sort_by=popularity.desc&page=${page}`;
			const res = await fetch(`/api/movies?endpoint=${encodeURIComponent(endpoint)}`);
			const data = await res.json();

			if (data.results && data.results.length > 0) {
				dailyMovie = data.results[movieIndex] || data.results[0];

				localStorage.setItem(storageKeyDate, todayStr);
				localStorage.setItem(storageKeyData, JSON.stringify(dailyMovie));
			}
		} catch (error) {
			console.error('Error fetching daily item:', error);
		}
	}

	/* 12. สั่งให้ฟังก์ชันทำงานอัตโนมัติตอนโหลดหน้าเว็บเสร็จ */
	onMount(() => {
		if (selectedGenreId === null && genres.length > 0 && !isSearching) {
			selectedGenreId = genres[0].id;
			fetchMoviesByGenre(genres[0].id);
		}

		loadDailyMovie();

		// ดึงข้อมูลคลังหนังที่เคยบันทึกไว้ในเครื่องขึ้นมา
		const localData = localStorage.getItem('findaflick_watchlist');
		if (localData) {
			try {
				savedMovies = JSON.parse(localData);
			} catch (err) {
				console.error('อ่านข้อมูลคลังหนังไม่สำเร็จ:', err);
			}
		}
	});

	/* 13. สั่งให้แถวหนังเลื่อนไปซ้ายหรือขวาตามปุ่มกด/ลูกกลิ้งเมาส์ */
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

	/* 14. สั่งให้แถวนักแสดงเลื่อนไปซ้ายหรือขวา */
	function scrollCast(direction: 'left' | 'right') {
		if (castContainer) {
			const scrollAmount = direction === 'left' ? -200 : 200;
			castContainer.scrollBy({ left: scrollAmount, behavior: 'smooth' });
		}
	}

	/* 15. แพลตฟอร์มสตรีมมิ่ง */
	const streamingPlatforms = [
		{ id: 8, name: 'Netflix', bgColor: 'hover:bg-[#E50914]', activeColor: 'bg-red-600' },
		{ id: 122, name: 'Disney+', bgColor: 'hover:bg-[#BCEFFF]', activeColor: 'bg-blue-600' },
		{ id: 315, name: 'HBO GO', bgColor: 'hover:bg-gray-300', activeColor: 'bg-gray-600' },
		{ id: 119, name: 'Prime Video', bgColor: 'hover:bg-[#0779FF]', activeColor: 'bg-cyan-600' },
		{ id: 191, name: 'iQIYI', bgColor: 'hover:bg-[#00DC5A]', activeColor: 'bg-green-500' },
		{ id: 350, name: 'Apple TV+', bgColor: 'hover:bg-gray-600', activeColor: 'bg-gray-600' }
	];

	/* 16. กรองหนังแบบผสม (เลือกหมวดหมู่ + แพลตฟอร์ม หรือ Marvel พร้อมกัน) */
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
			let endpoint = `/discover/${mediaType}?language=th-TH&sort_by=popularity.desc&page=${currentPage}`;

			if (selectedGenreId === 99999) {
				endpoint += `&with_keywords=180547`;
			} else if (selectedGenreId) {
				endpoint += `&with_genres=${selectedGenreId}`;
			}

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

	/* 17. กดเลือกหรือยกเลิกหมวดหมู่หนัง */
	function toggleGenre(genreId: number) {
		if (selectedGenreId === genreId) {
			selectedGenreId = null;
		} else {
			selectedGenreId = genreId;
		}
		applyFilters(1);
	}

	/* 18. กดเลือกหรือยกเลิกแพลตฟอร์มสตรีมมิ่ง */
	function togglePlatform(providerId: number | null) {
		if (providerId === null || selectedProviderId === providerId) {
			selectedProviderId = null;
		} else {
			selectedProviderId = providerId;
		}
		applyFilters(1);
	}

	/* 19. สุ่มเลือกหนัง/ซีรีส์เด็ดๆ ขึ้นมา 1 เรื่อง */
	async function pickRandomMovie() {
		isPlayingRandomMovieTrailer = false;
		randomTrailerKey = null;
		randomMovieProviders = [];

		isPosterReelSpinning = true;
		randomMovie = null;
		isModalOpen = true;
		isShaking = true;
		setTimeout(() => {
			isShaking = false;
		}, 400);

		let tickCount = 0;
		const spinInterval = setInterval(() => {
			playTickSound();
			tickCount++;
			if (tickCount > 25) {
				clearInterval(spinInterval);
			}
		}, 100);

		try {
			let baseEndpoint = `/discover/${mediaType}?language=th-TH&sort_by=popularity.desc`;
			if (selectedGenreId === 99999) {
				baseEndpoint += `&with_keywords=180547`;
			} else if (selectedGenreId) {
				baseEndpoint += `&with_genres=${selectedGenreId}`;
			}
			if (selectedProviderId) {
				baseEndpoint += `&watch_region=TH&with_watch_providers=${selectedProviderId}`;
			}

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
				clearInterval(spinInterval);
				isPosterReelSpinning = false;
				isModalOpen = false;
				alert(
					'ขอโทษครับเฮีย ขอโทษครับซ้อ ไม่พบเรื่องที่ตรงกับเงื่อนไขนี้ ลองเปลี่ยนตัวกรองดูใหม่เด้อ'
				);
				return;
			}

			const pickedMovieIndex = Math.floor(Math.random() * allDummyMovies.length);
			const finalMovie = allDummyMovies[pickedMovieIndex];

			let reelMoviesForAnimation = [];
			for (let i = 0; i < 15; i++) {
				let randomIndexForReel = Math.floor(Math.random() * allDummyMovies.length);
				reelMoviesForAnimation.push(allDummyMovies[randomIndexForReel]);
			}
			reelMoviesForAnimation.push(finalMovie);
			spinningPosterMovies = reelMoviesForAnimation;

			setTimeout(async () => {
				const detailEndpoint = `/${mediaType}/${finalMovie.id}?language=th-TH&append_to_response=videos,watch/providers&include_video_language=th,en,null`;
				const detailRes = await fetch(`/api/movies?endpoint=${encodeURIComponent(detailEndpoint)}`);
				const detailData = await detailRes.json();

				randomMovie = detailData;
				lastPickedMovie = detailData;

				isPosterReelSpinning = false;
				isModalOpen = true;
				playVictorySound();

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
			}, 2500);
		} catch (e) {
			isPosterReelSpinning = false;
			isModalOpen = false;
			console.error('Error fetching random movie reel:', e);
		}
	}

	/* 20. ล็อก Modal ไม่ให้เลื่อนฉากหลังได้ */
	$effect(() => {
		if (typeof document !== 'undefined') {
			if (isAnyModalOpen) {
				document.body.classList.add('overflow-hidden');
			} else {
				document.body.classList.remove('overflow-hidden');
			}
		}
	});

	/* 21. ป๊อปอัพเข้าเว็บครั้งแรก */
	$effect(() => {
		if (typeof window !== 'undefined') {
			const hasVisited = localStorage.getItem('has_seen_welcome');
			if (!hasVisited) {
				showWelcomeModal = true;
			}
		}
	});

	function closeWelcomeModal() {
		showWelcomeModal = false;
		if (typeof window !== 'undefined') {
			localStorage.setItem('has_seen_welcome', 'true');
		}
	}

	/* 22. ฟังก์ชันบอกรายได้หนัง */
	function formatMoney(amount: number) {
		if (!amount || amount === 0) return 'ไม่เปิดเผยข้อมูล';
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD',
			maximumFractionDigits: 0
		}).format(amount);
	}

	/* 23. ฟังก์ชันสร้างเสียงติ๊กสั้นๆ ตอนสล็อตกำลังหมุน */
	function playTickSound() {
		try {
			const ctx = getAudioContext();
			const oscillator = ctx.createOscillator();
			const gainNode = ctx.createGain();

			oscillator.type = 'triangle';
			oscillator.frequency.setValueAtTime(600, ctx.currentTime);
			oscillator.frequency.exponentialRampToValueAtTime(150, ctx.currentTime + 0.04);

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

	/* 24. ฟังก์ชันสร้างเสียงฉลองตอนสุ่มหนังสำเร็จ */
	function playVictorySound() {
		try {
			const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
			const notes = [523.25, 659.25, 783.99, 1046.5];

			notes.forEach((freq, index) => {
				const oscillator = ctx.createOscillator();
				const gainNode = ctx.createGain();

				oscillator.type = 'sine';
				oscillator.frequency.setValueAtTime(freq, ctx.currentTime + index * 0.08);

				gainNode.gain.setValueAtTime(0, ctx.currentTime + index * 0.08);
				gainNode.gain.linearRampToValueAtTime(0.2, ctx.currentTime + index * 0.08 + 0.02);
				gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + index * 0.08 + 0.3);

				oscillator.connect(gainNode);
				gainNode.connect(ctx.destination);

				oscillator.start(ctx.currentTime + index * 0.08);
				oscillator.stop(ctx.currentTime + index * 0.08 + 0.3);
			});
		} catch (e) {
			// ป้องกัน Error กรณีที่เบราว์เซอร์บล็อก AudioContext
		}
	}

	/* 25. แก้เสียงขาด */
	function getAudioContext() {
		if (!audioCtx) {
			audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
		}
		if (audioCtx.state === 'suspended') {
			audioCtx.resume();
		}
		return audioCtx;
	}

	/* 26. ฟังก์ชันสำหรับกดปุ่มสลับโหมดแบบเรียลไทม์ */
	async function switchMediaType(newType: 'movie' | 'tv') {
		mediaType = newType;
		selectedGenreId = null; // ล้างหมวดหมู่เดิมทันที เพราะ ID หมวดหมู่หนังกับซีรีส์ไม่ตรงกัน
		selectedProviderId = null;
		currentSlide = 0;

		await loadDailyMovie();
		await fetchTopMovies();

		if (isSwipeModeOpen) {
			openSwipeMode();
		} else {
			await applyFilters(1);
		}
	}

	/* 27. ระบบ Swipe Mode & Watchlist */
	let swipeCards = $state<any[]>([]);
	let currentIndex = $state(0);
	let startX = $state(0);
	let currentX = $state(0);
	let isDragging = $state(false);
	let isLoadingMore = $state(false);

	function syncLocalStorage() {
		localStorage.setItem('findaflick_watchlist', JSON.stringify(savedMovies));
	}

	function removeMovie(id: number) {
		savedMovies = savedMovies.filter((m: any) => m.id !== id);
		syncLocalStorage();
	}

	async function fetchMoreSwipeCards() {
		if (isLoadingMore) return;
		isLoadingMore = true;

		try {
			const maxPage = mediaType === 'tv' ? 5 : 15;
			let randomPage = Math.floor(Math.random() * maxPage) + 1;

			let endpoint = `/discover/${mediaType}?language=th-TH&sort_by=popularity.desc&page=${randomPage}`;

			if (selectedGenreId === 99999) {
				endpoint += `&with_keywords=180547`;
			}
			if (selectedProviderId) {
				endpoint += `&watch_region=TH&with_watch_providers=${selectedProviderId}`;
			}

			let res = await fetch(`/api/movies?endpoint=${encodeURIComponent(endpoint)}`);
			let data = await res.json();

			if (!data.results || data.results.length === 0) {
				endpoint = `/discover/${mediaType}?language=th-TH&sort_by=popularity.desc&page=1`;
				res = await fetch(`/api/movies?endpoint=${encodeURIComponent(endpoint)}`);
				data = await res.json();
			}

			if (data.results && data.results.length > 0) {
				const uniqueNewCards = data.results.filter(
					(newCard: any) =>
						newCard.poster_path &&
						!swipeCards.some((c: any) => c.id === newCard.id) &&
						!savedMovies.some((s: any) => s.id === newCard.id)
				);

				swipeCards = [...swipeCards, ...uniqueNewCards];
			}
		} catch (err) {
			console.error('Error fetching more swipe cards:', err);
		} finally {
			isLoadingMore = false;
		}
	}

	function openSwipeMode() {
		isSwipeModeOpen = true;
		currentIndex = 0;
		currentX = 0;
		swipeCards = [];
		fetchMoreSwipeCards();
	}

	function handleDragStart(e: MouseEvent | TouchEvent) {
		isDragging = true;
		startX = 'touches' in e ? e.touches[0].clientX : e.clientX;
	}

	function handleDragMove(e: MouseEvent | TouchEvent) {
		if (!isDragging) return;
		const x = 'touches' in e ? e.touches[0].clientX : e.clientX;
		currentX = x - startX;
	}

	function handleDragEnd() {
		if (!isDragging) return;
		isDragging = false;

		const swipeThreshold = 100;

		if (currentX > swipeThreshold) {
			const currentCard = swipeCards[currentIndex];
			if (currentCard && !savedMovies.some((m: any) => m.id === currentCard.id)) {
				savedMovies.push(currentCard);
				syncLocalStorage();
			}
			nextCard();
		} else if (currentX < -swipeThreshold) {
			nextCard();
		} else {
			currentX = 0;
		}
	}

	function nextCard() {
		currentX = 0;
		currentIndex++;

		if (swipeCards.length - currentIndex <= 3) {
			fetchMoreSwipeCards();
		}
	}

	async function fetchCardTrailer(card: any) {
		if (!card || card.yt_key !== undefined) return;

		try {
			const endpoint = `/${mediaType}/${card.id}?language=th-TH&append_to_response=videos&include_video_language=th,en,null`;
			const res = await fetch(`/api/movies?endpoint=${encodeURIComponent(endpoint)}`);
			const data = await res.json();
			const videos = data.videos?.results || [];

			let trailer =
				videos.find(
					(v: any) => v.site === 'YouTube' && v.type === 'Trailer' && v.iso_639_1 === 'th'
				) ||
				videos.find((v: any) => v.site === 'YouTube' && v.type === 'Trailer') ||
				videos.find((v: any) => v.site === 'YouTube');

			card.yt_key = trailer ? trailer.key : null;
		} catch (e) {
			console.error('Error fetching card trailer:', e);
			card.yt_key = null;
		}
	}

	$effect(() => {
		if (isSwipeModeOpen && swipeCards[currentIndex]) {
			fetchCardTrailer(swipeCards[currentIndex]);
			if (swipeCards[currentIndex + 1]) {
				fetchCardTrailer(swipeCards[currentIndex + 1]);
			}
		}
	});

	/* 28. สร้างลิงก์เด้งไปหน้าเรื่องนั้นบนแพลตฟอร์มสตรีมมิ่งทันที */
	function getStreamingUrl(provider: any, movie: any): string {
		const rawTitle =
			movie?.original_title || movie?.original_name || movie?.title || movie?.name || '';
		const query = encodeURIComponent(rawTitle);
		const providerName = (provider?.provider_name || '').toLowerCase();

		// ค้นหาเจาะจงเฉพาะหน้าหนัง/ซีรีส์ภายในเว็บ Disney+ โดยตรง
		if (
			provider.provider_id === 122 ||
			provider.provider_id === 337 ||
			providerName.includes('disney')
		) {
			return `https://www.google.com/search?q=site:disneyplus.com+${query}`;
		}

		switch (provider.provider_id) {
			case 8: // Netflix
				return `https://www.netflix.com/search?q=${query}`;
			case 119: // Prime Video
				return `https://www.primevideo.com/search/ref=atv_nb_sr?phrase=${query}`;
			case 191: // iQIYI
				return `https://www.iq.com/search?query=${query}`;
			case 350: // Apple TV+
				return `https://tv.apple.com/th/search?term=${query}`;
			case 158: // Viu
				return `https://www.viu.com/ott/th/th/search?keyword=${query}`;
			case 1899: // Max
			case 315: // HBO GO
				return `https://play.max.com/search?q=${query}`;
			default:
				return `https://www.google.com/search?q=${encodeURIComponent(`${provider.provider_name} ${rawTitle}`)}`;
		}
	}

	/* 29. ระบบ Desktop Hero Carousel */
	function nextSlide() {
		if (carouselMovies.length === 0) return;
		currentSlide = (currentSlide + 1) % carouselMovies.length;
	}

	function prevSlide() {
		if (carouselMovies.length === 0) return;
		currentSlide = (currentSlide - 1 + carouselMovies.length) % carouselMovies.length;
	}

	// รีเซ็ตวิดีโอตัวอย่างทุกครั้งที่เปลี่ยนสไลด์หรือเปลี่ยนโหมด
	$effect(() => {
		currentSlide;
		mediaType;
		isCarouselPlayingTrailer = false;
		carouselTrailerKey = null;
	});

	// สั่งเลื่อนสไลด์อัตโนมัติทุก 5 วินาที (หยุดเมื่อเอาเมาส์วางบนแบนเนอร์ หรือกำลังเล่นตัวอย่างอยู่)
	$effect(() => {
		if (carouselMovies.length === 0 || isCarouselHovered || isCarouselPlayingTrailer) return;

		const interval = setInterval(() => {
			nextSlide();
		}, 5000);

		return () => clearInterval(interval);
	});

	// แปลงรหัส genre_ids เป็นชื่อหมวดหมู่ภาษาไทย (โชว์สูงสุด 3 หมวด)
	function getSlideGenres(genreIds: number[] | undefined): string {
		if (!genreIds || genreIds.length === 0 || genres.length === 0) return '';
		return genreIds
			.map((id) => genres.find((g: { id: number; name: string }) => g.id === id)?.name)
			.filter(Boolean)
			.slice(0, 3)
			.join(' • ');
	}

	// กดปุ่ม + บน Carousel เพื่อเซฟหรือเอาออกจากคลังทันที
	function toggleCarouselWatchlist(movie: any) {
		const exists = savedMovies.some((m: any) => m.id === movie.id);
		if (exists) {
			removeMovie(movie.id);
		} else {
			savedMovies.push(movie);
			syncLocalStorage();
		}
	}

	async function toggleCarouselTrailer(movie: any) {
		if (isCarouselPlayingTrailer) {
			isCarouselPlayingTrailer = false;
			return;
		}

		isLoadingCarouselTrailer = true;
		try {
			const endpoint = `/${mediaType}/${movie.id}?language=th-TH&append_to_response=videos&include_video_language=th,en,null`;
			const res = await fetch(`/api/movies?endpoint=${encodeURIComponent(endpoint)}`);
			const data = await res.json();
			const videos = data.videos?.results || [];

			const trailer =
				videos.find(
					(v: any) => v.site === 'YouTube' && v.type === 'Trailer' && v.iso_639_1 === 'th'
				) ||
				videos.find((v: any) => v.site === 'YouTube' && v.type === 'Trailer') ||
				videos.find((v: any) => v.site === 'YouTube');

			if (trailer) {
				carouselTrailerKey = trailer.key;
				isCarouselPlayingTrailer = true;
			} else {
				alert('เรื่องนี้ยังไม่มีคลิปตัวอย่างในระบบครับ');
			}
		} catch (err) {
			console.error('Error loading carousel trailer:', err);
		} finally {
			isLoadingCarouselTrailer = false;
		}
	}

	//32. ฟังก์ชันกดโลโก้เพื่อล้างตัวกรองและกลับหน้าหลัก
	async function goHome() {
		isMobileSidebarOpen = false;
		searchQuery = '';
		isSearching = false;
		selectedGenreId = null;
		selectedProviderId = null;
		viewMode = 'home';
		window.scrollTo({ top: 0, behavior: 'smooth' });
		await applyFilters(1);
	}
</script>

<svelte:head>
	<title>FindAFlick</title>
</svelte:head>

<!-- ==================== TOP NAVBAR (Desktop + Mobile Bar) ==================== -->
<nav
	class="sticky top-0 z-40 w-full border-b border-white/10 bg-black/75 backdrop-blur-2xl transition-colors duration-300"
>
	<div class="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
		<!-- ฝั่งซ้าย: ปุ่ม Hamburger (มือถือ) + โลโก้ FindAFlick -->
		<div class="flex items-center gap-3">
			<button
				type="button"
				onclick={() => (isMobileSidebarOpen = true)}
				aria-label="เปิดเมนู"
				class="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border border-white/10 bg-white/5 text-gray-200 transition-all hover:bg-white/15 hover:text-white active:scale-95 md:hidden"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					stroke-width="2"
					stroke="currentColor"
					class="h-5 w-5"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
					/>
				</svg>
			</button>

			<button
				type="button"
				onclick={goHome}
				class="flex cursor-pointer items-center gap-2 text-left transition-transform active:scale-95"
			>
				<span
					class="text-2xl font-black tracking-tight transition-colors duration-300 {mediaType ===
					'movie'
						? 'text-red-500'
						: 'text-cyan-400'}"
				>
					FindAFlick
				</span>
			</button>
		</div>

		<!-- ตรงกลาง (เฉพาะ Desktop): สวิตช์สลับโหมด ภาพยนตร์ / ซีรีส์ -->
		<div
			class="relative hidden w-64 rounded-xl border border-white/10 bg-neutral-900/90 p-1 backdrop-blur-xl md:flex"
		>
			<button
				type="button"
				onclick={() => switchMediaType('movie')}
				class="relative z-10 flex w-1/2 cursor-pointer items-center justify-center py-1.5 text-xs font-bold transition-colors duration-300 {mediaType ===
				'movie'
					? 'text-white'
					: 'text-neutral-400 hover:text-white'}"
			>
				ภาพยนตร์
			</button>
			<button
				type="button"
				onclick={() => switchMediaType('tv')}
				class="relative z-10 flex w-1/2 cursor-pointer items-center justify-center py-1.5 text-xs font-bold transition-colors duration-300 {mediaType ===
				'tv'
					? 'text-white'
					: 'text-neutral-400 hover:text-white'}"
			>
				ซีรีส์
			</button>

			<!-- แถบสีวิ่งตามโหมด -->
			<div
				class="absolute top-1 bottom-1 left-1 w-[calc(50%-4px)] rounded-lg border border-white/20 transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] {mediaType ===
				'movie'
					? 'translate-x-0 border-red-400/50 bg-gradient-to-r from-red-500 to-orange-500 shadow-[0_0_15px_rgba(239,68,68,0.4)]'
					: 'translate-x-full border-cyan-300/50 bg-gradient-to-r from-cyan-400 to-blue-600 shadow-[0_0_15px_rgba(6,182,212,0.4)]'}"
			></div>
		</div>

		<!-- ฝั่งขวา (Desktop): โหมดปัด + คลังที่ปัดไว้ + ปุ่มสุ่มด่วน -->
		<div class="hidden items-center gap-2.5 md:flex">
			<button
				type="button"
				onclick={openSwipeMode}
				class="flex cursor-pointer items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3.5 py-2 text-xs font-bold text-gray-200 transition-all hover:border-white/25 hover:bg-white/15 hover:text-white active:scale-95"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 24 24"
					fill="currentColor"
					class="size-6"
				>
					<path
						fill-rule="evenodd"
						d="M12.963 2.286a.75.75 0 0 0-1.071-.136 
				9.742 9.742 0 0 0-3.539 6.176 7.547 7.547 
				0 0 1-1.705-1.715.75.75 0 0 0-1.152-.082A9 
				9 0 1 0 15.68 4.534a7.46 7.46 0 0 1-2.717-2.248ZM15.75 
				14.25a3.75 3.75 0 1 1-7.313-1.172c.628.465 1.35.81 
				2.133 1a5.99 5.99 0 0 1 1.925-3.546 3.75 3.75 0 0 1 3.255 3.718Z"
						clip-rule="evenodd"
					/>
				</svg>

				<span>โหมดปัด</span>
			</button>

			<button
				type="button"
				onclick={() => (isWatchlistOpen = true)}
				class="relative flex cursor-pointer items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3.5 py-2 text-xs font-bold text-gray-200 transition-all hover:border-white/25 hover:bg-white/15 hover:text-white active:scale-95"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 20 20"
					fill="currentColor"
					class="size-5"
				>
					<path
						fill-rule="evenodd"
						d="M10 2c-1.716 0-3.408.106-5.07.31C3.806 
				2.45 3 3.414 3 4.517V17.25a.75.75 0 0 0 1.075.676L10 
				15.082l5.925 2.844A.75.75 0 0 0 17 17.25V4.517c0-1.103-.806-2.068-1.93-2.207A41.403 41.403 0 0 0 10 2Z"
						clip-rule="evenodd"
					/>
				</svg>
				<span>คลังที่ปัดไว้</span>
				{#if savedMovies.length > 0}
					<span
						class="ml-0.5 rounded-full bg-purple-500 px-1.5 py-0.5 text-[10px] font-black text-white shadow-sm"
					>
						{savedMovies.length}
					</span>
				{/if}
			</button>

			<button
				type="button"
				onclick={pickRandomMovie}
				disabled={movies.length === 0 || isLoading}
				class="cursor-pointer rounded-xl px-4 py-2 text-xs font-extrabold text-white shadow-lg transition-all hover:scale-[1.03] active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 {mediaType ===
				'movie'
					? 'bg-gradient-to-r from-red-500 to-orange-500 shadow-red-500/25 hover:from-red-400 hover:to-orange-400'
					: 'bg-gradient-to-r from-cyan-500 to-blue-600 shadow-cyan-500/25 hover:from-cyan-400 hover:to-blue-500'}"
			>
				สุ่มเลย
			</button>
		</div>

		<!-- ฝั่งขวา (เฉพาะมือถือ): ปุ่มลัดเปิดคลังที่ปัดไว้ -->
		<div class="flex items-center gap-2 md:hidden">
			<button
				type="button"
				onclick={() => (isWatchlistOpen = true)}
				aria-label="คลังที่ปัดไว้"
				class="relative flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border border-white/10 bg-white/5 text-gray-200 transition-all active:scale-95"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 24 24"
					fill="currentColor"
					class="size-6"
				>
					<path
						fill-rule="evenodd"
						d="M6.32 2.577a49.255 49.255 0 0 1 11.36 
				0c1.497.174 2.57 1.46 2.57 2.93V21a.75.75 0 0 
				1-1.085.67L12 18.089l-7.165 3.583A.75.75 0 0 1 3.75 
				21V5.507c0-1.47 1.073-2.756 2.57-2.93Z"
						clip-rule="evenodd"
					/>
				</svg>

				{#if savedMovies.length > 0}
					<span
						class="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-purple-500 px-1 text-[10px] font-black text-white"
					>
						{savedMovies.length}
					</span>
				{/if}
			</button>
		</div>
	</div>
</nav>

<!-- ==================== MOBILE SIDEBAR DRAWER ==================== -->
{#if isMobileSidebarOpen}
	<!-- Backdrop พื้นหลังมืด -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		transition:fade={{ duration: 200 }}
		onclick={() => (isMobileSidebarOpen = false)}
		class="fixed inset-0 z-[110] bg-black/75 backdrop-blur-md md:hidden"
	></div>

	<!-- ตัวลิ้นชัก Sidebar -->
	<aside
		transition:fly={{ x: -280, duration: 280 }}
		class="fixed inset-y-0 left-0 z-[115] flex w-72 max-w-[82vw] flex-col justify-between border-r border-white/15 bg-neutral-950/95 p-5 shadow-[0_8px_32px_rgba(0,0,0,0.85)] backdrop-blur-2xl md:hidden"
	>
		<div>
			<!-- หัว Sidebar + ปุ่มปิด X -->
			<div class="mb-6 flex items-center justify-between border-b border-white/10 pb-4">
				<span
					class="text-2xl font-black tracking-tight {mediaType === 'movie'
						? 'text-red-500'
						: 'text-cyan-400'}"
				>
					FindAFlick
				</span>
				<button
					type="button"
					onclick={() => (isMobileSidebarOpen = false)}
					aria-label="ปิดเมนู"
					class="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-white/10 bg-white/10 text-gray-300 transition-all hover:bg-white/20 hover:text-white active:scale-95"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						fill="none"
						viewBox="0 0 24 24"
						stroke-width="2.5"
						stroke="currentColor"
						class="h-4 w-4"
					>
						<path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<!-- สลับโหมด ภาพยนตร์ / ซีรีส์ ใน Sidebar -->
			<div class="mb-6">
				<p class="mb-2 px-1 text-[11px] font-bold tracking-wider text-gray-400 uppercase">
					เลือกหมวดหลัก
				</p>
				<div class="relative flex w-full rounded-xl border border-white/10 bg-neutral-900 p-1">
					<button
						type="button"
						onclick={() => {
							switchMediaType('movie');
							isMobileSidebarOpen = false;
						}}
						class="relative z-10 flex w-1/2 cursor-pointer items-center justify-center py-2.5 text-xs font-bold transition-colors {mediaType ===
						'movie'
							? 'text-white'
							: 'text-neutral-400'}"
					>
						ภาพยนตร์
					</button>
					<button
						type="button"
						onclick={() => {
							switchMediaType('tv');
							isMobileSidebarOpen = false;
						}}
						class="relative z-10 flex w-1/2 cursor-pointer items-center justify-center py-2.5 text-xs font-bold transition-colors {mediaType ===
						'tv'
							? 'text-white'
							: 'text-neutral-400'}"
					>
						ซีรีส์
					</button>
					<div
						class="absolute top-1 bottom-1 left-1 w-[calc(50%-4px)] rounded-lg transition-all duration-300 {mediaType ===
						'movie'
							? 'translate-x-0 bg-gradient-to-r from-red-500 to-orange-500'
							: 'translate-x-full bg-gradient-to-r from-cyan-400 to-blue-600'}"
					></div>
				</div>
			</div>

			<!-- รายการเมนูหลัก -->
			<div class="flex flex-col gap-2">
				<p class="mb-1 px-1 text-[11px] font-bold tracking-wider text-gray-400 uppercase">
					เมนูใช้งาน
				</p>

				<button
					type="button"
					onclick={goHome}
					class="flex w-full cursor-pointer items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.04] px-4 py-3 text-left text-sm font-bold text-white transition-all hover:bg-white/10 active:scale-95"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						fill="none"
						viewBox="0 0 24 24"
						stroke-width="2"
						stroke="currentColor"
						class="h-5 w-5 text-gray-300"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"
						/>
					</svg>
					<span>หน้าหลัก</span>
				</button>

				<button
					type="button"
					onclick={() => {
						isMobileSidebarOpen = false;
						pickRandomMovie();
					}}
					class="flex w-full cursor-pointer items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.04] px-4 py-3 text-left text-sm font-bold text-white transition-all hover:bg-white/10 active:scale-95"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						fill="none"
						viewBox="0 0 24 24"
						stroke-width="2"
						stroke="currentColor"
						class="h-5 w-5 {mediaType === 'movie' ? 'text-red-400' : 'text-cyan-400'}"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 0 0-3.7-3.7 48.678 48.678 0 0 0-7.324 0 4.006 4.006 0 0 0-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 0 0 3.7 3.7 48.656 48.656 0 0 0 7.324 0 4.006 4.006 0 0 0 3.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3-3 3"
						/>
					</svg>
					<span>สุ่ม{mediaType === 'movie' ? 'ภาพยนตร์' : 'ซีรีส์'}เลย</span>
				</button>

				<button
					type="button"
					onclick={() => {
						isMobileSidebarOpen = false;
						openSwipeMode();
					}}
					class="flex w-full cursor-pointer items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.04] px-4 py-3 text-left text-sm font-bold text-white transition-all hover:bg-white/10 active:scale-95"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						fill="none"
						viewBox="0 0 24 24"
						stroke-width="2"
						stroke="currentColor"
						class="h-5 w-5 text-pink-400"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M15.362 5.214A8.252 8.252 0 0 1 12 21 8.25 8.25 0 0 1 6.038 7.047 8.287 8.287 0 0 0 9 9.601a8.983 8.983 0 0 1 3.361-6.867 8.21 8.21 0 0 0 3 2.48Z"
						/>
					</svg>
					<span>โหมดปัดเลือกเรื่อง</span>
				</button>

				<button
					type="button"
					onclick={() => {
						isMobileSidebarOpen = false;
						isWatchlistOpen = true;
					}}
					class="flex w-full cursor-pointer items-center justify-between rounded-2xl border border-white/5 bg-white/[0.04] px-4 py-3 text-left text-sm font-bold text-white transition-all hover:bg-white/10 active:scale-95"
				>
					<div class="flex items-center gap-3">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							fill="none"
							viewBox="0 0 24 24"
							stroke-width="2"
							stroke="currentColor"
							class="h-5 w-5 text-purple-400"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z"
							/>
						</svg>
						<span>คลังที่ปัดไว้</span>
					</div>
					{#if savedMovies.length > 0}
						<span class="rounded-full bg-purple-500 px-2 py-0.5 text-xs font-black text-white">
							{savedMovies.length}
						</span>
					{/if}
				</button>
			</div>
		</div>

		<!-- ส่วนท้าย Sidebar -->
		<div class="border-t border-white/10 pt-4">
			<button
				type="button"
				onclick={() => {
					isMobileSidebarOpen = false;
					showWelcomeModal = true;
				}}
				class="mb-3 flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold text-gray-400 transition-colors hover:bg-white/5 hover:text-white"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					stroke-width="2"
					stroke="currentColor"
					class="h-4 w-4"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z"
					/>
				</svg>
				<span>เกี่ยวกับ FindAFlick</span>
			</button>
			<p class="px-3 text-[11px] font-medium tracking-wider text-gray-500 uppercase">by Sammy</p>
		</div>
	</aside>
{/if}

<main class="min-h-screen bg-black p-8 text-white">
	<div class="mx-auto max-w-6xl">
		<div class="mb-8 text-center">
			<p class="mb-5 text-xs whitespace-nowrap text-gray-300 sm:text-base md:text-lg">
				อยากดู{mediaType === 'movie' ? 'ภาพยนตร์' : 'ซีรีส์'}แต่ไม่รู้จะดูเรื่องไร ให้เราจัดการให้
			</p>

			<!-- ปุ่มสุ่มหนังไฮไลท์ -->
			<button
				onclick={pickRandomMovie}
				disabled={movies.length === 0 || isLoading}
				class="cursor-pointer rounded-full px-8 py-4 text-lg font-extrabold text-white transition-all duration-200 active:translate-y-1.5 disabled:cursor-not-allowed disabled:opacity-50 {mediaType ===
				'movie'
					? 'bg-gradient-to-r from-red-500 to-orange-500 shadow-[inset_0_3px_6px_rgba(255,255,255,0.4),inset_0_-5px_8px_rgba(0,0,0,0.3),0_12px_25px_rgba(239,68,68,0.4)] hover:from-red-400 hover:to-orange-400 hover:shadow-[inset_0_3px_6px_rgba(255,255,255,0.5),inset_0_-5px_8px_rgba(0,0,0,0.3),0_15px_30px_rgba(239,68,68,0.5)] active:shadow-[inset_0_2px_3px_rgba(0,0,0,0.3),0_4px_10px_rgba(239,68,68,0.3)]'
					: 'bg-gradient-to-r from-cyan-500 to-blue-600 shadow-[inset_0_3px_6px_rgba(255,255,255,0.4),inset_0_-5px_8px_rgba(0,0,0,0.3),0_12px_25px_rgba(6,182,212,0.4)] hover:from-cyan-400 hover:to-blue-500 hover:shadow-[inset_0_3px_6px_rgba(255,255,255,0.5),inset_0_-5px_8px_rgba(0,0,0,0.3),0_15px_30px_rgba(6,182,212,0.5)] active:shadow-[inset_0_2px_3px_rgba(0,0,0,0.3),0_4px_10px_rgba(6,182,212,0.3)]'}"
			>
				กดปุ่มนี้เพื่อสุ่ม
			</button>
		</div>

		<!-- หน้าต่างโชว์ลิสต์หนังที่ปัดขวา -->
		{#if isWatchlistOpen}
			<!-- Backdrop คลิกพื้นหลังปิด modal ได้ -->
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="fixed inset-0 z-[120] flex items-center justify-center bg-black/75 px-4 backdrop-blur-md transition-all duration-300"
				onclick={(e) => {
					if (e.target === e.currentTarget) isWatchlistOpen = false;
				}}
			>
				<!-- Modal Card สไตล์ Glassmorphism -->
				<div
					class="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/20 bg-neutral-950/75 shadow-[0_8px_32px_0_rgba(0,0,0,0.6)] backdrop-blur-2xl transition-all"
				>
					<!-- แสง Glow พื้นหลังกระจก -->
					<div
						class="pointer-events-none absolute -top-16 -left-16 h-44 w-44 rounded-full bg-purple-500/20 blur-3xl"
					></div>
					<div
						class="pointer-events-none absolute -right-16 -bottom-16 h-44 w-44 rounded-full bg-indigo-500/20 blur-3xl"
					></div>

					<!-- หัวข้อหน้าต่าง -->
					<div
						class="relative z-10 flex items-center justify-between border-b border-white/10 bg-white/5 px-6 py-4 backdrop-blur-md"
					>
						<h3 class="text-xl font-bold tracking-wide text-white drop-shadow-sm">
							เรื่องที่ปัดไว้
						</h3>
						<button
							type="button"
							onclick={() => (isWatchlistOpen = false)}
							class="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-white/10 bg-white/10 text-gray-300 backdrop-blur-md transition-all duration-200 hover:scale-105 hover:bg-white/20 hover:text-white active:scale-95"
							aria-label="ปิดหน้าต่างคลัง"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								fill="none"
								viewBox="0 0 24 24"
								stroke-width="2.5"
								stroke="currentColor"
								class="h-4 w-4"
							>
								<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
							</svg>
						</button>
					</div>

					<!-- รายชื่อหนัง -->
					<div
						class="relative z-10 max-h-[60vh] [scrollbar-width:none] overflow-y-auto p-4 [&::-webkit-scrollbar]:hidden"
					>
						{#if savedMovies.length === 0}
							<div
								class="flex flex-col items-center justify-center py-12 text-center text-gray-400"
							>
								<p class="text-sm font-medium">ยังไม่ได้ปัดขวาเลือกเรื่องไหนเลยน้า</p>
							</div>
						{:else}
							<div class="flex flex-col gap-3">
								{#each savedMovies as movie}
									<div
										class="group flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.07] p-2.5 shadow-md backdrop-blur-xl transition-all duration-300 hover:-translate-y-0.5 hover:border-white/25 hover:bg-white/[0.12]"
									>
										<!-- โปสเตอร์หนังขอบกระจก -->
										<div
											class="relative h-20 w-14 flex-shrink-0 overflow-hidden rounded-xl border border-white/15 shadow-md"
										>
											{#if movie.poster_path}
												<img
													src="https://image.tmdb.org/t/p/w200{movie.poster_path}"
													alt={movie.title || movie.name}
													class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
												/>
											{:else}
												<div
													class="flex h-full w-full items-center justify-center bg-white/5 text-[10px] text-gray-400"
												>
													ไม่มีรูป
												</div>
											{/if}
										</div>

										<!-- รายละเอียด -->
										<div class="flex-grow">
											<h4
												class="line-clamp-1 font-bold text-white transition-colors group-hover:text-purple-300"
											>
												{movie.title || movie.name}
											</h4>
											<span
												class="mt-1 inline-flex items-center gap-1 rounded-md border border-yellow-400/20 bg-yellow-400/10 px-2 py-0.5 text-xs font-semibold text-yellow-300 backdrop-blur-sm"
											>
												⭐IMDB {movie.vote_average ? movie.vote_average.toFixed(1) : 'N/A'}
											</span>
										</div>

										<!-- ปุ่มลบสไตล์ Glass ถังขยะ -->
										<button
											type="button"
											onclick={() => removeMovie(movie.id)}
											class="mr-1 flex h-8 w-8 cursor-pointer items-center justify-center rounded-xl border border-red-500/20 bg-red-500/10 text-red-400 opacity-70 backdrop-blur-md transition-all hover:border-red-500/40 hover:bg-red-500 hover:text-white hover:opacity-100 active:scale-95"
											title="ลบออกจากคลัง"
										>
											<svg
												xmlns="http://www.w3.org/2000/svg"
												fill="none"
												viewBox="0 0 24 24"
												stroke-width="2"
												stroke="currentColor"
												class="h-4 w-4"
											>
												<path
													stroke-linecap="round"
													stroke-linejoin="round"
													d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
												/>
											</svg>
										</button>
									</div>
								{/each}
							</div>
						{/if}
					</div>
				</div>
			</div>
		{/if}

		<!-- ช่องค้นหาหนัง -->
		<div class="mb-8 flex justify-center px-4">
			<div class="relative w-full max-w-xl transition-all duration-300 focus-within:-translate-y-1">
				<input
					type="text"
					bind:value={searchQuery}
					onkeydown={(e) => {
						if (e.key === ' ' && !searchQuery.trim()) {
							e.preventDefault();
						}
						if (e.key === 'Enter') {
							searchMovies();
						}
					}}
					placeholder="อยากดูเรื่องไรไหนบอกซิ.."
					class="w-full rounded-full border border-white/10 bg-white/5 px-6 py-4 pr-24
            				text-white placeholder-gray-400 backdrop-blur-md transition-all focus:border-red-500/50
            				focus:bg-white/10 focus:ring-1 focus:ring-red-500/50 focus:outline-none"
				/>

				<div class="absolute top-1/2 right-3 flex -translate-y-1/2 items-center gap-1.5">
					{#if searchQuery}
						<button
							type="button"
							onclick={() => {
								searchQuery = '';
								searchMovies();
							}}
							class="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-white/10 text-gray-300 transition-all hover:bg-white/20 hover:text-white active:scale-95"
							title="ล้างคำค้นหา"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								fill="none"
								viewBox="0 0 24 24"
								stroke-width="2"
								stroke="currentColor"
								class="size-4"
							>
								<path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
							</svg>
						</button>
					{/if}

					<!-- svelte-ignore a11y_consider_explicit_label -->
					<button
						type="button"
						onclick={() => searchMovies()}
						class="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full transition-all active:scale-95 {mediaType ===
						'movie'
							? 'bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-white'
							: 'bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500 hover:text-white'}"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							fill="none"
							viewBox="0 0 24 24"
							stroke-width="1.5"
							stroke="currentColor"
							class="pointer-events-none size-5"
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

			<!-- เส้นแบ่งสัดส่วน -->
			<div class="mx-auto w-3/4 border-t border-white/10 md:w-1/2"></div>

			<!-- กลุ่มหมวดหมู่ภาพยนตร์/ซีรีส์ -->
			<div class="mt-4 flex flex-col gap-4 md:text-center">
				<h3 class="text-lg font-bold tracking-wide text-white md:text-xl">
					หมวดหมู่{mediaType === 'movie' ? 'ภาพยนตร์' : 'ซีรีส์'}
				</h3>
				<div
					class="flex scrollbar-none gap-2.5 overflow-x-auto pb-3 md:flex-wrap md:justify-center md:overflow-visible [&::-webkit-scrollbar]:hidden"
				>
					{#each genres as genre}
						<button
							type="button"
							onclick={() => toggleGenre(genre.id)}
							class="flex-shrink-0 cursor-pointer rounded-2xl border px-4 py-2 text-sm font-semibold backdrop-blur-md transition-all duration-300 active:scale-95 {selectedGenreId ===
							genre.id
								? mediaType === 'movie'
									? 'border-red-400 bg-red-600/80 text-white shadow-[0_0_20px_rgba(239,68,68,0.3)]'
									: 'border-cyan-400 bg-cyan-600/80 text-white shadow-[0_0_20px_rgba(6,182,212,0.3)]'
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

		<!-- Desktop Hero Carousel สไตล์ Disney+ แบบจัดเต็ม (แสดงเฉพาะหน้าจอ Desktop) -->
		{#if viewMode === 'home' && carouselMovies.length > 0}
			<div
				class="relative my-8 hidden w-full px-4 lg:block"
				onmouseenter={() => (isCarouselHovered = true)}
				onmouseleave={() => (isCarouselHovered = false)}
				role="region"
				aria-label="Featured Carousel"
			>
				<!-- แสง Ambient Backlight ด้านหลังกรอบ -->
				<div
					class="pointer-events-none absolute -inset-1 mx-6 rounded-[2rem] opacity-30 blur-2xl transition-colors duration-700 {mediaType ===
					'movie'
						? 'bg-gradient-to-r from-red-600/40 via-orange-500/20 to-transparent'
						: 'bg-gradient-to-r from-cyan-500/40 via-blue-600/20 to-transparent'}"
				></div>

				<div
					class="group relative h-[560px] w-full overflow-hidden rounded-[2rem] border border-white/15 bg-neutral-950 shadow-[0_20px_50px_rgba(0,0,0,0.85)]"
				>
					<!-- สไลด์แต่ละใบ -->
					{#each carouselMovies as movie, index}
						{@const isSaved = savedMovies.some((m: any) => m.id === movie.id)}
						{@const releaseYear = (movie.release_date || movie.first_air_date)?.split('-')[0]}
						{@const genreText = getSlideGenres(movie.genre_ids)}

						<div
							class="absolute inset-0 transition-opacity duration-700 ease-out {index ===
							currentSlide
								? 'z-10 opacity-100'
								: 'pointer-events-none z-0 opacity-0'}"
						>
							<!-- พื้นหลัง: วิดีโอตัวอย่าง (ถ้ากดเล่น) หรือ ภาพ Backdrop (ต้องเป็น absolute inset-0) -->
							{#if index === currentSlide && isCarouselPlayingTrailer && carouselTrailerKey}
								<div class="absolute inset-0 bg-black">
									<iframe
										src={`https://www.youtube.com/embed/${carouselTrailerKey}?autoplay=1&mute=1&controls=0&modestbranding=1&rel=0&loop=1&playlist=${carouselTrailerKey}`}
										title="Trailer Preview"
										class="pointer-events-none h-full w-full scale-[1.2] object-cover opacity-85"
										allow="autoplay; encrypted-media"
									></iframe>
								</div>
							{:else}
								<img
									src={`https://image.tmdb.org/t/p/original${movie.backdrop_path || movie.poster_path}`}
									alt={movie.title || movie.name}
									class="absolute inset-0 h-full w-full object-cover object-center transition-transform duration-[7000ms] ease-out {index ===
									currentSlide
										? 'scale-105'
										: 'scale-100'}"
								/>
							{/if}

							<!-- Vignette Gradients ไล่เงามืดให้อ่านข้อความชัด -->
							<div
								class="absolute inset-0 bg-gradient-to-t from-black via-black/35 to-black/20"
							></div>
							<div
								class="absolute inset-0 bg-gradient-to-r from-black via-black/80 via-45% to-transparent"
							></div>

							<!-- โครงสร้างเนื้อหา 2 ฝั่ง (ซ้อนทับบนพื้นหลังด้วย absolute inset-0) -->
							<div class="absolute inset-0 z-10 flex items-center justify-between px-16 pt-6 pb-24">
								<!-- ฝั่งซ้าย: รายละเอียดเรื่อง -->
								<div class="flex max-w-xl flex-col justify-center">
									<!-- แถวป้ายอันดับ + คะแนน + ภาษา -->
									<div class="mb-3 flex flex-wrap items-center gap-2">
										<span
											class="rounded-md px-2.5 py-1 text-[11px] font-black tracking-widest text-white uppercase shadow-md {mediaType ===
											'movie'
												? 'bg-gradient-to-r from-red-600 to-orange-500'
												: 'bg-gradient-to-r from-cyan-500 to-blue-600'}"
										>
											TOP #{index + 1}
											{mediaType === 'movie' ? 'MOVIE' : 'SERIES'}
										</span>

										<span
											class="rounded-md border border-white/15 bg-black/50 px-2.5 py-1 text-xs font-bold text-yellow-400 backdrop-blur-md"
										>
											⭐ IMDB {movie.vote_average ? movie.vote_average.toFixed(1) : 'N/A'}
										</span>

										{#if movie.original_language}
											<span
												class="rounded-md border border-white/15 bg-white/10 px-2 py-1 text-[11px] font-bold text-gray-200 uppercase backdrop-blur-md"
											>
												{movie.original_language}
											</span>
										{/if}

										{#if movie.vote_count}
											<span class="text-xs font-medium text-gray-400">
												({movie.vote_count.toLocaleString()} โหวต)
											</span>
										{/if}
									</div>

									<!-- ชื่อเรื่องใหญ่ -->
									<h2
										class="mb-2.5 line-clamp-2 text-4xl font-black tracking-tight text-white drop-shadow-[0_4px_12px_rgba(0,0,0,0.8)] xl:text-5xl"
									>
										{movie.title || movie.name}
									</h2>

									<!-- แถบ Metadata (ปี • หมวดหมู่) -->
									<div
										class="mb-3 flex flex-wrap items-center gap-2 text-sm font-semibold text-gray-200"
									>
										{#if releaseYear}
											<span>{releaseYear}</span>
										{/if}
										{#if releaseYear && genreText}
											<span class="text-white/40">•</span>
										{/if}
										{#if genreText}
											<span class="text-gray-300">{genreText}</span>
										{/if}
									</div>

									<!-- เรื่องย่อ -->
									<p class="mb-6 line-clamp-3 text-sm leading-relaxed text-gray-300/90">
										{movie.overview || 'ไม่มีคำอธิบายเนื้อเรื่องย่อสำหรับเรื่องนี้'}
									</p>

									<!-- ชุดปุ่มกดสไตล์ Disney+ -->
									<div class="flex items-center gap-3">
										<!-- ปุ่มหลัก: ดูรายละเอียด -->
										<button
											type="button"
											onclick={() => openMovieDetails(movie.id, mediaType)}
											class="flex cursor-pointer items-center gap-2 rounded-xl bg-white px-7 py-3.5 text-sm font-black tracking-wide text-black shadow-[0_8px_25px_rgba(255,255,255,0.2)] transition-all duration-200 hover:scale-[1.03] hover:bg-gray-100 active:scale-95"
										>
											<svg
												xmlns="http://www.w3.org/2000/svg"
												viewBox="0 0 24 24"
												fill="currentColor"
												class="h-5 w-5"
											>
												<path
													fill-rule="evenodd"
													d="M4.5 5.653c0-1.427 1.529-2.33 2.779-1.643l11.54 6.347c1.295.712 1.295 2.573 0 3.286L7.28 19.99c-1.25.687-2.779-.217-2.779-1.643V5.653Z"
													clip-rule="evenodd"
												/>
											</svg>
											<span>ดูรายละเอียด</span>
										</button>

										<!-- ปุ่มรอง: เล่น/ปิด ตัวอย่างในแบนเนอร์ -->
										<button
											type="button"
											onclick={() => toggleCarouselTrailer(movie)}
											disabled={isLoadingCarouselTrailer}
											class="flex cursor-pointer items-center gap-2 rounded-xl border border-white/25 bg-white/10 px-5 py-3.5 text-sm font-bold text-white backdrop-blur-md transition-all duration-200 hover:border-white/60 hover:bg-white/20 active:scale-95"
										>
											{#if isLoadingCarouselTrailer && index === currentSlide}
												<span
													class="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
												></span>
												<span>กำลังโหลด...</span>
											{:else if isCarouselPlayingTrailer && index === currentSlide}
												<span>✕</span>
												<span>ปิดตัวอย่าง</span>
											{:else}
												<svg
													xmlns="http://www.w3.org/2000/svg"
													fill="none"
													viewBox="0 0 24 24"
													stroke-width="2"
													stroke="currentColor"
													class="h-4 w-4"
												>
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z"
													/>
												</svg>
												<span>ตัวอย่าง</span>
											{/if}
										</button>
									</div>
								</div>

								<!-- ฝั่งขวา: การ์ดโปสเตอร์กระจกลอยตัว (ซ่อนอัตโนมัติตอนเล่นวิดีโอตัวอย่าง) -->
								{#if !(isCarouselPlayingTrailer && index === currentSlide) && movie.poster_path}
									<button
										type="button"
										onclick={() => openMovieDetails(movie.id, mediaType)}
										class="group/poster relative hidden cursor-pointer xl:block"
										title="คลิกเพื่อดูรายละเอียด"
									>
										<!-- แสงเรืองใต้โปสเตอร์ -->
										<div
											class="absolute -inset-2 rounded-3xl opacity-40 blur-xl transition-opacity duration-500 group-hover/poster:opacity-75 {mediaType ===
											'movie'
												? 'bg-gradient-to-tr from-red-600 to-orange-400'
												: 'bg-gradient-to-tr from-cyan-500 to-blue-600'}"
										></div>

										<!-- กรอบโปสเตอร์ Glassmorphism -->
										<div
											class="relative w-44 rotate-2 overflow-hidden rounded-2xl border border-white/25 bg-white/10 p-1.5 shadow-[0_25px_50px_rgba(0,0,0,0.9)] backdrop-blur-xl transition-all duration-500 group-hover/poster:scale-105 group-hover/poster:rotate-0"
										>
											<img
												src={`https://image.tmdb.org/t/p/w500${movie.poster_path}`}
												alt={movie.title || movie.name}
												class="aspect-[2/3] w-full rounded-xl object-cover"
											/>
											<div
												class="absolute inset-x-3 bottom-3 flex items-center justify-between rounded-lg border border-white/15 bg-black/70 px-2.5 py-1.5 text-[11px] font-bold text-white backdrop-blur-md"
											>
												<span>อันดับ #{index + 1}</span>
												<span class="text-yellow-400">★ {movie.vote_average?.toFixed(1)}</span>
											</div>
										</div>
									</button>
								{/if}
							</div>
						</div>
					{/each}

					<!-- แถบเลื่อนซ้าย -->
					<button
						type="button"
						onclick={prevSlide}
						aria-label="ก่อนหน้า"
						class="absolute inset-y-0 left-0 z-20 flex w-14 cursor-pointer items-center justify-center bg-gradient-to-r from-black/60 to-transparent text-white/70 opacity-0 transition-all duration-300 group-hover:opacity-100 hover:text-white"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							fill="none"
							viewBox="0 0 24 24"
							stroke-width="2.5"
							stroke="currentColor"
							class="h-8 w-8 transition-transform hover:scale-125"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M15.75 19.5 8.25 12l7.5-7.5"
							/>
						</svg>
					</button>

					<!-- แถบเลื่อนขวา -->
					<button
						type="button"
						onclick={nextSlide}
						aria-label="ถัดไป"
						class="absolute inset-y-0 right-0 z-20 flex w-14 cursor-pointer items-center justify-center bg-gradient-to-l from-black/60 to-transparent text-white/70 opacity-0 transition-all duration-300 group-hover:opacity-100 hover:text-white"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							fill="none"
							viewBox="0 0 24 24"
							stroke-width="2.5"
							stroke="currentColor"
							class="h-8 w-8 transition-transform hover:scale-125"
						>
							<path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
						</svg>
					</button>

					<!-- แถบการ์ดพรีวิวด้านล่างขวา (Interactive Thumbnail Dock) -->
					<div class="absolute right-10 bottom-6 z-20 flex items-center gap-2.5">
						{#each carouselMovies as thumb, idx}
							<button
								type="button"
								onclick={() => (currentSlide = idx)}
								aria-label="เลือก {thumb.title || thumb.name}"
								class="group/thumb relative h-14 w-24 cursor-pointer overflow-hidden rounded-xl border-2 transition-all duration-300 {idx ===
								currentSlide
									? 'scale-105 border-white shadow-[0_0_20px_rgba(255,255,255,0.45)]'
									: 'scale-95 border-white/20 opacity-55 hover:scale-100 hover:border-white/60 hover:opacity-100'}"
							>
								<img
									src={`https://image.tmdb.org/t/p/w300${thumb.backdrop_path || thumb.poster_path}`}
									alt={thumb.title || thumb.name}
									class="h-full w-full object-cover transition-transform duration-300 group-hover/thumb:scale-110"
								/>
								<div
									class="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent"
								></div>
								<span
									class="absolute right-1.5 bottom-1 left-1.5 line-clamp-1 text-left text-[10px] font-bold text-white drop-shadow"
								>
									{idx + 1}. {thumb.title || thumb.name}
								</span>
							</button>
						{/each}
					</div>
				</div>
			</div>
		{/if}

		<!-- แบนเนอร์หนังแนะนำประจำวัน (แสดงเฉพาะหน้า home) -->
		{#if viewMode === 'home' && dailyMovie}
			<div class="my-8 w-full px-4">
				<h2 class="mb-4 flex items-center gap-2 text-2xl font-bold text-white">
					วันนี้ดู{mediaType === 'movie' ? 'ภาพยนตร์' : 'ซีรีส์'}อะไรดี?
				</h2>

				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="group relative cursor-pointer overflow-hidden rounded-3xl border
				border-white/10 bg-black/50 shadow-[0_8px_30px_rgba(0,0,0,0.5)] transition-all hover:border-white/20"
					onclick={() => openMovieDetails(dailyMovie.id)}
				>
					<div class="absolute inset-0 z-0">
						<img
							src={`https://image.tmdb.org/t/p/w1280${dailyMovie.backdrop_path || dailyMovie.poster_path}`}
							alt={dailyMovie.title || dailyMovie.name}
							class="h-full w-full object-cover opacity-40 transition-transform duration-700 group-hover:scale-105"
						/>

						<div
							class="absolute inset-0 bg-gradient-to-t from-black via-black/70 to-transparent"
						></div>
						<div
							class="absolute inset-0 bg-gradient-to-r from-black via-black/80 to-transparent md:via-black/50"
						></div>
					</div>

					<div class="relative z-10 flex flex-col gap-6 p-6 md:flex-row md:items-center md:p-8">
						<div
							class="hidden w-32 flex-shrink-0 overflow-hidden rounded-xl border border-white/10 shadow-2xl md:block md:w-44"
						>
							<img
								src={`https://image.tmdb.org/t/p/w500${dailyMovie.poster_path}`}
								alt={dailyMovie.title || dailyMovie.name}
								class="h-full w-full object-cover"
							/>
						</div>

						<div class="flex flex-col justify-center">
							<div class="mb-3">
								<span
									class="inline-block rounded-full px-3 py-1 text-xs font-bold text-white shadow-lg backdrop-blur-md {mediaType ===
									'movie'
										? 'bg-red-600 shadow-red-500/30'
										: 'bg-sky-600 shadow-sky-500/30'}"
								>
									Pick Of The Day 🍿
								</span>
							</div>
							<h3 class="mb-2 text-3xl font-bold text-white drop-shadow-md md:text-4xl">
								{dailyMovie.title || dailyMovie.name}
							</h3>

							<div class="mb-4 flex items-center gap-3 text-sm text-gray-300">
								<span
									class="rounded-md bg-white/10 px-2 py-0.5 font-bold text-yellow-400 backdrop-blur-sm"
								>
									⭐ IMDB {dailyMovie.vote_average?.toFixed(1) || 'N/A'}
								</span>
								<span>•</span>
								<span
									>{(dailyMovie.release_date || dailyMovie.first_air_date)?.split('-')[0] ||
										'N/A'}</span
								>
							</div>

							<p
								class="mb-4 line-clamp-3 max-w-3xl text-sm leading-relaxed text-gray-300 md:text-base"
							>
								{dailyMovie.overview || 'ไม่มีคำอธิบายเนื้อเรื่องย่อสำหรับเรื่องนี้'}
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

		<!-- Top 10 แบบเรียลไทม์ -->
		{#if viewMode == 'home'}
			<div class="my-10 w-full px-4">
				<h2 class="mb-4 text-2xl font-bold text-white">
					Top 10 {mediaType === 'movie' ? 'ภาพยนตร์' : 'ซีรีส์'} เขาดูอะไรกันอยู่ตอนนี้
				</h2>

				<div class="group relative">
					<!-- ปุ่มเลื่อนซ้าย -->
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

					<!-- แถวเลื่อนดูข้อมูล -->
					<div
						id="top-movies-container"
						class="flex [scrollbar-width:none] scrollbar-none gap-4 overflow-x-auto scroll-smooth pt-4 pb-4 pl-6 [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
					>
						{#each topMovies as movie, index}
							<!-- svelte-ignore a11y_click_events_have_key_events -->
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<div
								class="group/item relative max-w-[130px] min-w-[130px] shrink-0 cursor-pointer sm:max-w-[150px] sm:min-w-[150px]"
								onclick={() => openMovieDetails(movie.id, mediaType)}
							>
								<span
									class="pointer-events-none absolute -bottom-3 -left-4 z-10 {mediaType === 'movie'
										? 'from-red-600 to-orange-600'
										: 'from-cyan-500 to-blue-600'} bg-gradient-to-r
                            bg-clip-text text-7xl font-black text-transparent italic drop-shadow-[0_4px_4px_rgba(0,0,0,0.8)]
                            transition-transform group-hover/item:scale-105 sm:text-8xl"
								>
									{index + 1}
								</span>

								<div class="relative aspect-[2/3] overflow-hidden rounded-lg bg-white/5 shadow-lg">
									{#if movie.poster_path}
										<img
											src={`https://image.tmdb.org/t/p/w500${movie.poster_path}`}
											alt={movie.title || movie.name}
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

		<!-- แบนเนอร์เรื่องที่สุ่มได้ล่าสุด -->
		{#if lastPickedMovie}
			<div
				class="relative mb-8 overflow-hidden rounded-3xl border border-white/15 bg-white/5 p-5 shadow-[0_8px_32px_rgba(0,0,0,0.37)] backdrop-blur-2xl transition-all duration-300 md:p-6"
			>
				<div
					class="pointer-events-none absolute -top-12 -right-12 h-44 w-44 rounded-full bg-amber-500/10 blur-3xl"
				></div>
				<div
					class="pointer-events-none absolute -bottom-12 -left-12 h-44 w-44 rounded-full bg-red-500/10 blur-3xl"
				></div>

				<div class="relative z-10 flex flex-col items-center gap-5 md:flex-row md:gap-6">
					<div
						class="relative h-40 w-28 flex-shrink-0 overflow-hidden rounded-2xl border border-white/20 bg-black/30 shadow-lg md:h-36 md:w-24"
					>
						{#if lastPickedMovie.poster_path}
							<img
								src="https://image.tmdb.org/t/p/w300{lastPickedMovie.poster_path}"
								alt={lastPickedMovie.title || lastPickedMovie.name}
								class="h-full w-full object-cover transition-transform duration-500 hover:scale-105"
							/>
						{:else}
							<div class="flex h-full items-center justify-center bg-white/5 text-xs text-gray-400">
								ไม่มีรูป
							</div>
						{/if}
					</div>

					<div class="flex flex-grow flex-col justify-center text-center md:text-left">
						<div class="mb-2 flex items-center justify-center gap-2 md:justify-start">
							<span
								class="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10
    px-4 py-1.5 text-[11px] font-extrabold tracking-wide text-white
    shadow-[0_8px_20px_rgba(0,0,0,0.2)] backdrop-blur-xl transition-all duration-200 hover:scale-[1.02] hover:bg-white/15"
							>
								<span class="drop-shadow-sm">เมื่อกี้สุ่มได้เรื่องนี้ครับเตงเบ๊บ</span>
							</span>
							<span
								class="rounded-lg border border-white/10 bg-white/5 px-2 py-0.5 text-xs font-semibold text-yellow-300 backdrop-blur-sm"
							>
								⭐ IMDB {lastPickedMovie.vote_average
									? lastPickedMovie.vote_average.toFixed(1)
									: 'N/A'}
							</span>
						</div>

						<h3
							class="mb-1 text-xl font-extrabold tracking-wide text-white drop-shadow-md md:text-2xl"
						>
							{lastPickedMovie.title || lastPickedMovie.name}
						</h3>

						<p class="mb-4 line-clamp-2 max-w-xl text-xs leading-relaxed text-gray-300/90">
							{lastPickedMovie.overview || 'ไม่มีคำอธิบายเนื้อเรื่องย่อ'}
						</p>
					</div>
				</div>
			</div>
		{:else}
			<div
				class="relative mb-8 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] p-6 text-center shadow-[0_8px_32px_rgba(0,0,0,0.2)] backdrop-blur-xl md:p-8"
			>
				<div
					class="pointer-events-none absolute -bottom-10 -left-10 h-32 w-32 rounded-full bg-red-600/10 blur-3xl"
				></div>

				<div class="relative z-10 flex flex-col items-center justify-center gap-3">
					<span class="animate-bounce text-3xl">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="16"
							height="16"
							fill="currentColor"
							class="bi bi-camera-reels-fill"
							viewBox="0 0 16 16"
						>
							<path d="M6 3a3 3 0 1 1-6 0 3 3 0 0 1 6 0" />
							<path d="M9 6a3 3 0 1 1 0-6 3 3 0 0 1 0 6" />
							<path
								d="M9 6h.5a2 2 0 0 1 1.983 1.738l3.11-1.382A1 1 0 0 1 16 7.269v7.462a1 1 0 0 1-1.406.913l-3.111-1.382A2 2 0 0 1 9.5 16H2a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z"
							/>
						</svg>
					</span>
					<h3 class="text-lg font-bold tracking-wide text-white">
						อ้าวยังไม่ได้สุ่ม{mediaType === 'movie' ? 'ภาพยนตร์' : 'ซีรีส์'}เลยหนิ <br />
						<span class="text-sm font-normal text-white">ลองกดสุ่มดูก่อนนะ</span>
					</h3>
					<p class="max-w-md text-xs leading-relaxed text-gray-400">
						กดปุ่มสุ่มด้านบนก่อน <br /> สุ่มได้เรื่องอะไร{mediaType === 'movie'
							? 'ภาพยนตร์'
							: 'ซีรีส์'}จะมาโชว์ตรงนี้เอง
					</p>
				</div>
			</div>
		{/if}

		<!-- แสดงรายชื่อหนัง/ซีรีส์ -->
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
						พบ{mediaType === 'movie' ? 'ภาพยนตร์' : 'ซีรีส์'}
						<span class="font-bold text-white">{movies.length}</span> เรื่อง
					{/if}
				</span>
			</div>

			{#if isLoading}
				<div
					class="animate-pulse rounded-2xl border border-white/5 bg-white/5 py-20 text-center text-lg text-gray-400 backdrop-blur-sm"
				>
					รอสักครู่นะครับพี่...
				</div>
			{:else if movies.length > 0}
				<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-6 md:grid-cols-4 lg:grid-cols-5">
					{#each movies as movie, index}
						{@const isSaved = savedMovies.some((m: any) => m.id === movie.id)}
						{@const releaseYear = (movie.release_date || movie.first_air_date)?.split('-')[0]}
						{@const genreLabel = getSlideGenres(movie.genre_ids)}

						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<div
							onclick={() => openMovieDetails(movie.id, mediaType)}
							class="group fade-in-card relative aspect-[2/3] w-full cursor-pointer overflow-hidden rounded-2xl border border-white/10 bg-neutral-900 shadow-[0_10px_30px_rgba(0,0,0,0.65)] transition-all duration-500 hover:-translate-y-2 {mediaType ===
							'movie'
								? 'hover:border-red-500/50 hover:shadow-[0_16px_36px_rgba(239,68,68,0.28)]'
								: 'hover:border-cyan-400/50 hover:shadow-[0_16px_36px_rgba(6,182,212,0.28)]'}"
							style="animation-delay: {(index % 10) * 50}ms;"
						>
							<!-- แสงวิบวับพาดผ่านการ์ดตอน Hover (Glass Shine Sweep) -->
							<div
								class="pointer-events-none absolute inset-0 z-20 -translate-x-full bg-gradient-to-r from-transparent via-white/15 to-transparent transition-transform duration-1000 ease-out group-hover:translate-x-full"
							></div>

							<!-- ภาพโปสเตอร์เต็มใบ -->
							{#if movie.poster_path}
								<img
									src="https://image.tmdb.org/t/p/w500{movie.poster_path}"
									alt={movie.title || movie.name}
									class="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-110"
									loading="lazy"
								/>
							{:else}
								<div
									class="flex h-full items-center justify-center bg-neutral-900 p-4 text-center text-xs text-gray-500"
								>
									ไม่มีรูปภาพโปสเตอร์
								</div>
							{/if}

							<!-- ไล่เงาดำด้านบนและด้านล่างให้อ่านตัวหนังสือชัด -->
							<div
								class="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/55 via-transparent to-black/95 transition-opacity duration-300"
							></div>
							<div
								class="pointer-events-none absolute inset-0 bg-black/30 opacity-0 backdrop-blur-[1px] transition-opacity duration-300 group-hover:opacity-100"
							></div>

							<!-- แถบบน: ปุ่มเซฟด่วน (ซ้าย) + คะแนน IMDB (ขวา) -->
							<div
								class="absolute inset-x-2.5 top-2.5 z-10 flex items-center justify-between gap-2"
							>
								<!-- ปุ่มเพิ่ม/ลบออกจากคลังทันที -->
								<button
									type="button"
									onclick={(e) => {
										e.stopPropagation();
										toggleCarouselWatchlist(movie);
									}}
									title={isSaved ? 'อยู่ในคลังแล้ว (กดเพื่อนำออก)' : 'บันทึกเข้าคลัง'}
									aria-label={isSaved ? 'นำออกจากคลัง' : 'บันทึกเข้าคลัง'}
									class="flex h-8 w-8 cursor-pointer items-center justify-center rounded-xl border backdrop-blur-md transition-all duration-200 hover:scale-110 active:scale-95 {isSaved
										? 'border-emerald-400/50 bg-emerald-500/25 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.35)]'
										: 'border-white/15 bg-black/50 text-white/80 hover:border-white/40 hover:bg-black/75 hover:text-white'}"
								>
									{#if isSaved}
										<svg
											xmlns="http://www.w3.org/2000/svg"
											viewBox="0 0 20 20"
											fill="currentColor"
											class="h-4 w-4"
										>
											<path
												fill-rule="evenodd"
												d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z"
												clip-rule="evenodd"
											/>
										</svg>
									{:else}
										<svg
											xmlns="http://www.w3.org/2000/svg"
											viewBox="0 0 20 20"
											fill="currentColor"
											class="h-4 w-4"
										>
											<path
												fill-rule="evenodd"
												d="M10 2c-1.716 0-3.408.106-5.07.31C3.806 2.45 3 3.414 3 4.517V17.25a.75.75 0 0 0 1.075.676L10 15.082l5.925 2.844A.75.75 0 0 0 17 17.25V4.517c0-1.103-.806-2.068-1.93-2.207A41.403 41.403 0 0 0 10 2Z"
												clip-rule="evenodd"
											/>
										</svg>
									{/if}
								</button>

								<!-- ป้ายคะแนน IMDB -->
								<div
									class="flex items-center gap-1 rounded-xl border border-white/15 bg-black/55 px-2.5 py-1 text-[11px] font-extrabold text-yellow-400 shadow-sm backdrop-blur-md"
								>
									<span>⭐</span>
									<span>{movie.vote_average ? movie.vote_average.toFixed(1) : 'N/A'}</span>
								</div>
							</div>

							<!-- แถบข้อมูลด้านล่าง (เลื่อนขยายโชว์เรื่องย่อและปุ่มกดตอน Hover) -->
							<div class="absolute inset-x-0 bottom-0 z-10 flex flex-col justify-end p-3.5 sm:p-4">
								<!-- ปีที่ฉาย + หมวดหมู่ย่อ -->
								<div
									class="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold tracking-wide text-gray-300"
								>
									{#if releaseYear}
										<span
											class="rounded-md border border-white/15 bg-white/10 px-1.5 py-0.5 backdrop-blur-sm"
										>
											{releaseYear}
										</span>
									{/if}
									{#if genreLabel}
										<span class="line-clamp-1 text-gray-300/90">{genreLabel.split(' • ')[0]}</span>
									{/if}
								</div>

								<!-- ชื่อเรื่อง -->
								<h3
									class="line-clamp-1 text-sm font-extrabold text-white drop-shadow-md transition-colors duration-300 group-hover:line-clamp-2 sm:text-base {mediaType ===
									'movie'
										? 'group-hover:text-red-400'
										: 'group-hover:text-cyan-300'}"
									title={movie.title || movie.name}
								>
									{movie.title || movie.name}
								</h3>

								<!-- ส่วนขยายตอน Hover: เรื่องย่อ + ปุ่มดูรายละเอียด -->
								<div
									class="grid grid-rows-[0fr] opacity-0 transition-all duration-300 ease-out group-hover:mt-2 group-hover:grid-rows-[1fr] group-hover:opacity-100"
								>
									<div class="overflow-hidden">
										<p class="mb-2.5 line-clamp-2 text-[11px] leading-relaxed text-gray-300">
											{movie.overview || 'ยังไม่มีคำอธิบายเนื้อเรื่องย่อ...'}
										</p>

										<div
											class="flex w-full items-center justify-center gap-1.5 rounded-xl py-1.5 text-xs font-extrabold text-white shadow-md transition-colors {mediaType ===
											'movie'
												? 'bg-gradient-to-r from-red-600 to-orange-500'
												: 'bg-gradient-to-r from-cyan-500 to-blue-600'}"
										>
											<span>ดูรายละเอียด</span>
											<svg
												xmlns="http://www.w3.org/2000/svg"
												viewBox="0 0 20 20"
												fill="currentColor"
												class="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5"
											>
												<path
													fill-rule="evenodd"
													d="M3 10a.75.75 0 0 1 .75-.75h10.638L10.23 5.29a.75.75 0 1 1 1.04-1.08l5.5 5.25a.75.75 0 0 1 0 1.08l-5.5 5.25a.75.75 0 1 1-1.04-1.08l4.158-3.96H3.75A.75.75 0 0 1 3 10Z"
													clip-rule="evenodd"
												/>
											</svg>
										</div>
									</div>
								</div>
							</div>
						</div>
					{/each}
				</div>

				<!-- Pagination -->
				<div class="my-8 flex flex-wrap items-center justify-center gap-3 px-4 md:my-10 md:gap-4">
					<button
						onclick={() => changePage(currentPage - 1)}
						disabled={currentPage === 1 || isLoading}
						class="flex flex-1 cursor-pointer items-center justify-center rounded-xl border border-white/10
						bg-white/5 px-4 py-2.5 text-sm font-semibold text-white shadow-lg backdrop-blur-md transition-all
						hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30 md:flex-none md:px-5"
					>
						← ก่อนหน้า
					</button>

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
					ไม่พบรายชื่อ{mediaType === 'movie' ? 'ภาพยนตร์' : 'ซีรีส์'}ในหมวดหมู่นี้
				</div>
			{/if}
		</div>
	</div>
</main>

<!-- Modal แสดงผลลัพธ์เมื่อกดสุ่มหนัง/ซีรีส์ -->
{#if isModalOpen}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md transition-all duration-300"
		onclick={(e) => {
			if (e.target === e.currentTarget) closeRandomModal();
		}}
	>
		<!-- กล่องครอบ Modal + แสง Glow รอบกรอบตามโหมด -->
		<div class="relative w-full max-w-2xl {isShaking ? 'animate-shake' : ''}">
			<div
				class="pointer-events-none absolute -inset-1.5 rounded-[2rem] opacity-50 blur-xl transition-colors duration-500 {mediaType ===
				'movie'
					? 'bg-gradient-to-r from-red-600/40 via-orange-500/20 to-amber-500/40'
					: 'bg-gradient-to-r from-cyan-500/40 via-blue-600/20 to-indigo-500/40'}"
			></div>

			<!-- ชุดปุ่มมุมขวาบน (ย้ายออกมาอยู่นอกกล่องเลื่อน เพื่อให้ลอยค้างตลอดเวลาบนมือถือ) -->
			<div class="absolute top-4 right-4 z-30 flex items-center gap-2">
				{#if randomMovie && !isPosterReelSpinning}
					{@const isSaved = savedMovies.some((m: any) => m.id === randomMovie.id)}
					<button
						type="button"
						onclick={() => toggleCarouselWatchlist(randomMovie)}
						title={isSaved ? 'อยู่ในคลังแล้ว' : 'บันทึกเข้าคลัง'}
						class="flex h-9 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 text-xs font-bold backdrop-blur-md transition-all active:scale-95 {isSaved
							? 'border-emerald-400/40 bg-emerald-500/20 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.25)]'
							: 'border-white/15 bg-black/70 text-gray-200 hover:border-white/35 hover:bg-black/85 hover:text-white'}"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							viewBox="0 0 20 20"
							fill="currentColor"
							class="h-3.5 w-3.5"
						>
							{#if isSaved}
								<path
									fill-rule="evenodd"
									d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z"
									clip-rule="evenodd"
								/>
							{:else}
								<path
									fill-rule="evenodd"
									d="M10 2c-1.716 0-3.408.106-5.07.31C3.806 2.45 3 3.414 3 4.517V17.25a.75.75 0 0 0 1.075.676L10 15.082l5.925 2.844A.75.75 0 0 0 17 17.25V4.517c0-1.103-.806-2.068-1.93-2.207A41.403 41.403 0 0 0 10 2Z"
									clip-rule="evenodd"
								/>
							{/if}
						</svg>
						<span>{isSaved ? 'บันทึกแล้ว' : 'เก็บไว้ดู'}</span>
					</button>
				{/if}

				<button
					type="button"
					onclick={closeRandomModal}
					class="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-white/15 bg-black/70 text-gray-300 backdrop-blur-md transition-all hover:rotate-90 hover:border-white/35 hover:bg-white/20 hover:text-white active:scale-95"
					aria-label="Close modal"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						fill="none"
						viewBox="0 0 24 24"
						stroke-width="2.5"
						stroke="currentColor"
						class="size-4"
					>
						<path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<!-- ตัวกล่อง Modal หลัก (ส่วนที่เลื่อนขึ้นลงได้) -->
			<div
				class="animate-in fade-in zoom-in relative max-h-[90vh] w-full [scrollbar-width:none] overflow-y-auto rounded-3xl border border-white/15 bg-neutral-950/85 shadow-[0_20px_50px_rgba(0,0,0,0.8)] backdrop-blur-2xl duration-200 [&::-webkit-scrollbar]:hidden"
			>
				<!-- ลูกเล่น 1: ภาพพื้นหลังเบลอเปลี่ยนโทนสีตามโปสเตอร์เรื่องที่สุ่มได้ -->
				{#if randomMovie && !isPosterReelSpinning && (randomMovie.backdrop_path || randomMovie.poster_path)}
					<div class="pointer-events-none absolute inset-0 overflow-hidden opacity-25">
						<img
							src="https://image.tmdb.org/t/p/w500{randomMovie.backdrop_path ||
								randomMovie.poster_path}"
							alt=""
							class="h-full w-full scale-125 object-cover blur-2xl transition-all duration-700"
						/>
						<div
							class="absolute inset-0 bg-gradient-to-b from-neutral-950/40 via-neutral-950/80 to-neutral-950"
						></div>
					</div>
				{/if}

				<!-- เว้นระยะด้านบน (pt-16) กันปุ่มมุมขวาบนบังรูปหรือวิดีโอ -->
				<div class="relative z-10 flex flex-col px-5 pt-16 pb-5 md:px-7 md:pt-14 md:pb-7">
					<!-- โซนเล่นตัวอย่าง YouTube -->
					{#if isPlayingRandomMovieTrailer && randomTrailerKey}
						<div
							class="relative isolate mb-6 aspect-video w-full translate-z-0 transform overflow-hidden rounded-2xl border border-white/15 bg-black shadow-2xl"
							style="mask-image: radial-gradient(white, black); -webkit-mask-image: -webkit-radial-gradient(white, black);"
						>
							<iframe
								src={`https://www.youtube.com/embed/${randomTrailerKey}?autoplay=1`}
								title="Random Trailer"
								class="h-full w-full rounded-2xl border-0"
								allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
								allowfullscreen
							></iframe>

							<button
								type="button"
								onclick={() => (isPlayingRandomMovieTrailer = false)}
								class="absolute top-2.5 right-2.5 z-10 cursor-pointer rounded-full border border-white/20 bg-black/75 px-3 py-1 text-xs font-bold text-white backdrop-blur-md transition-all hover:bg-black"
							>
								✕ ปิดตัวอย่าง
							</button>
						</div>
					{/if}

					<div class="flex flex-col gap-6 md:flex-row">
						<!-- ลูกเล่น 2: กรอบโปสเตอร์ทรงตู้สล็อต + กดที่รูปเพื่อเล่นตัวอย่างได้ -->
						<div class="relative mx-auto w-40 flex-shrink-0 md:mx-0 md:w-48">
							<!-- เข็มชี้ซ้าย-ขวาตอนวงล้อหมุน -->
							{#if isPosterReelSpinning}
								<div
									class="absolute top-1/2 -left-2.5 z-20 -translate-y-1/2 text-xs text-amber-400 drop-shadow-[0_0_6px_rgba(251,191,36,0.9)]"
								>
									▶
								</div>
								<div
									class="absolute top-1/2 -right-2.5 z-20 -translate-y-1/2 text-xs text-amber-400 drop-shadow-[0_0_6px_rgba(251,191,36,0.9)]"
								>
									◀
								</div>
							{/if}

							<div
								onclick={() => {
									if (!isPosterReelSpinning && randomTrailerKey && !isPlayingRandomMovieTrailer) {
										isPlayingRandomMovieTrailer = true;
									}
								}}
								class="group relative aspect-[2/3] w-full overflow-hidden rounded-2xl border-2 bg-black/50 shadow-2xl transition-all duration-300 {isPosterReelSpinning
									? 'border-amber-400/80 shadow-[0_0_25px_rgba(251,191,36,0.3)]'
									: randomTrailerKey
										? 'cursor-pointer border-white/20 hover:scale-[1.02] hover:border-white/40'
										: 'border-white/15'}"
							>
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
										<!-- เงาโค้งบน-ล่าง + เส้นเล็งกลางวงล้อ -->
										<div
											class="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/70 via-transparent to-black/70"
										></div>
										<div
											class="pointer-events-none absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-amber-400/70 shadow-[0_0_10px_rgba(251,191,36,1)]"
										></div>
									</div>
								{:else if randomMovie}
									{#if randomMovie.poster_path}
										<img
											src="https://image.tmdb.org/t/p/w500{randomMovie.poster_path}"
											alt={randomMovie.title || randomMovie.name}
											class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
										/>
									{:else}
										<div class="flex h-full items-center justify-center text-xs text-gray-500">
											ไม่มีรูปภาพ
										</div>
									{/if}

									<!-- แสงวิบวับพาดผ่านโปสเตอร์ตอน Hover -->
									<div
										class="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover:translate-x-full"
									></div>

									<!-- ปุ่ม Play ลอยขึ้นมาเมื่อเอาเมาส์ชี้โปสเตอร์ (ถ้ามี Trailer) -->
									{#if randomTrailerKey && !isPlayingRandomMovieTrailer}
										<div
											class="absolute inset-0 flex flex-col items-center justify-center bg-black/45 opacity-0 backdrop-blur-[2px] transition-opacity duration-300 group-hover:opacity-100"
										>
											<div
												class="flex h-12 w-12 items-center justify-center rounded-full bg-red-600 text-white shadow-[0_0_20px_rgba(220,38,38,0.8)] transition-transform duration-300 group-hover:scale-110"
											>
												<svg
													xmlns="http://www.w3.org/2000/svg"
													viewBox="0 0 24 24"
													fill="currentColor"
													class="ml-0.5 h-6 w-6"
												>
													<path
														fill-rule="evenodd"
														d="M4.5 5.653c0-1.427 1.529-2.33 2.779-1.643l11.54 6.347c1.295.712 1.295 2.573 0 3.286L7.28 19.99c-1.25.687-2.779-.217-2.779-1.643V5.653Z"
														clip-rule="evenodd"
													/>
												</svg>
											</div>
											<span class="mt-2 text-[11px] font-bold text-white drop-shadow">
												เล่นตัวอย่าง
											</span>
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
						</div>

						<!-- รายละเอียดหนัง/ซีรีส์ -->
						<div class="flex flex-grow flex-col justify-between text-left">
							{#if randomMovie && !isPosterReelSpinning}
								<div>
									<!-- ป้ายคะแนน IMDB + ปีที่ฉาย -->
									<div class="mb-2.5 flex flex-wrap items-center gap-2">
										<span
											class="rounded-full border border-yellow-400/30 bg-yellow-500/20 px-3 py-1 text-xs font-extrabold text-yellow-300 backdrop-blur-md"
										>
											⭐ IMDB {randomMovie.vote_average
												? randomMovie.vote_average.toFixed(1)
												: 'N/A'}
										</span>

										{#if randomMovie.release_date || randomMovie.first_air_date}
											<span
												class="rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-xs font-semibold text-gray-200"
											>
												{(randomMovie.release_date || randomMovie.first_air_date)?.slice(0, 4)}
											</span>
										{/if}
									</div>

									<h3 class="mb-2 text-2xl font-black tracking-tight text-white drop-shadow-md">
										{randomMovie.title || randomMovie.name}
									</h3>

									<p
										class="mb-4 max-h-32 [scrollbar-width:none] overflow-y-auto pr-1 text-sm leading-relaxed text-gray-300 [&::-webkit-scrollbar]:hidden"
									>
										{randomMovie.overview || 'ไม่มีคำอธิบายเนื้อเรื่องย่อสำหรับเรื่องนี้'}
									</p>
								</div>

								<!-- ส่วนแสดงแพลตฟอร์มสตรีมมิ่ง -->
								{#if randomMovieProviders.length > 0}
									<div
										class="mb-4 rounded-2xl border border-white/10 bg-white/[0.04] p-3 backdrop-blur-sm"
									>
										<h4 class="mb-2 text-[11px] font-bold tracking-wide text-gray-400">
											อ๋อเรื่องนี้อยู่ในแพลตฟอร์ม
										</h4>
										<div class="flex flex-wrap gap-2">
											{#each randomMovieProviders as provider}
												<a
													href={getStreamingUrl(provider, randomMovie)}
													target="_blank"
													rel="noopener noreferrer"
													class="group/prov flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-black/40 px-2.5 py-1.5 shadow-sm transition-all hover:scale-105 hover:border-white/35 hover:bg-white/15 active:scale-95"
												>
													<img
														src={`https://image.tmdb.org/t/p/w92${provider.logo_path}`}
														alt={provider.provider_name}
														class="h-5 w-5 rounded-md object-cover shadow-sm"
													/>
													<span class="text-xs font-bold text-white">{provider.provider_name}</span>
													<span
														class="text-[10px] text-gray-400 transition-transform group-hover/prov:translate-x-0.5 group-hover/prov:-translate-y-0.5 group-hover/prov:text-white"
													>
														↗
													</span>
												</a>
											{/each}
										</div>
									</div>
								{/if}

								<!-- ปุ่มกดดูตัวอย่าง -->
								{#if randomTrailerKey && !isPlayingRandomMovieTrailer}
									<button
										type="button"
										onclick={() => (isPlayingRandomMovieTrailer = true)}
										class="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-red-400/30 bg-red-600/85 py-2.5 text-sm font-bold text-white shadow-lg shadow-red-600/25 transition-all hover:bg-red-600 active:scale-95"
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											width="16"
											height="16"
											fill="currentColor"
											viewBox="0 0 16 16"
										>
											<path
												d="M8.051 1.999h.089c.822.003 4.987.033 6.11.335a2.01 2.01 0 0 1 1.415 1.42c.101.38.172.883.22 1.402l.01.104.022.26.008.104c.065.914.073 1.77.074 1.957v.075c-.001.194-.01 1.108-.082 2.06l-.008.105-.009.104c-.05.572-.124 1.14-.235 1.558a2.01 2.01 0 0 1-1.415 1.42c-1.16.312-5.569.334-6.18.335h-.142c-.309 0-1.587-.006-2.927-.052l-.17-.006-.087-.004-.171-.007-.171-.007c-1.11-.049-2.167-.128-2.654-.26a2.01 2.01 0 0 1-1.415-1.419c-.111-.417-.185-.986-.235-1.558L.09 9.82l-.008-.104A31 31 0 0 1 0 7.68v-.123c.002-.215.01-.958.064-1.778l.007-.103.003-.052.008-.104.022-.26.01-.104c.048-.519.119-1.023.22-1.402a2.01 2.01 0 0 1 1.415-1.42c.487-.13 1.544-.21 2.654-.26l.17-.007.172-.006.086-.003.171-.007A100 100 0 0 1 7.858 2zM6.4 5.209v4.818l4.157-2.408z"
											/>
										</svg>
										<span>ชมตัวอย่าง{mediaType === 'movie' ? 'ภาพยนตร์' : 'ซีรีส์'} (Trailer)</span>
									</button>
								{/if}
							{:else}
								<!-- สถานะระหว่างวงล้อกำลังหมุน -->
								<div class="flex h-full flex-col justify-center py-6">
									<p class="mb-2 animate-pulse text-lg font-black text-white">
										กำลังสุ่มหา{mediaType === 'movie' ? 'ภาพยนตร์' : 'ซีรีส์'}ให้ ใจเย็น ๆ
									</p>
									<p class="mb-5 text-xs text-gray-400">ลุ้นกันว่าวันนี้จะได้ดูเรื่องอะไร...</p>
									<div class="space-y-2.5">
										<div class="h-3 w-3/4 animate-pulse rounded-full bg-white/10"></div>
										<div class="h-3 w-full animate-pulse rounded-full bg-white/10"></div>
										<div class="h-3 w-1/2 animate-pulse rounded-full bg-white/10"></div>
									</div>
								</div>
							{/if}
						</div>
					</div>
				</div>

				<!-- ลูกเล่น 3: เส้นรอยปรุฉีกตั๋วหนัง (Ticket Stub Divider) -->
				<div class="relative z-10 flex items-center">
					<div class="h-6 w-6 -translate-x-3 rounded-full border border-white/15 bg-black/90"></div>
					<div class="flex-1 border-t-2 border-dashed border-white/15"></div>
					<div class="h-6 w-6 translate-x-3 rounded-full border border-white/15 bg-black/90"></div>
				</div>

				<!-- ส่วนหางตั๋ว: ปุ่มสุ่มใหม่ 3D + ปุ่มปิด -->
				<div class="relative z-10 flex gap-3 bg-white/[0.02] px-5 py-4 md:px-7">
					<button
						type="button"
						disabled={isPosterReelSpinning}
						onclick={() => {
							isPlayingRandomMovieTrailer = false;
							pickRandomMovie();
						}}
						class="group relative flex-1 cursor-pointer overflow-hidden rounded-2xl px-4 py-3.5 text-sm font-extrabold text-white transition-all duration-200 active:translate-y-1 disabled:cursor-not-allowed disabled:opacity-50 {mediaType ===
						'movie'
							? 'bg-gradient-to-b from-red-500 to-red-700 shadow-[inset_0_2px_4px_rgba(255,255,255,0.4),inset_0_-4px_6px_rgba(0,0,0,0.3),0_10px_20px_rgba(229,9,20,0.4)] hover:from-red-400 hover:to-red-600'
							: 'bg-gradient-to-b from-cyan-500 to-blue-700 shadow-[inset_0_2px_4px_rgba(255,255,255,0.4),inset_0_-4px_6px_rgba(0,0,0,0.3),0_10px_20px_rgba(6,182,212,0.4)] hover:from-cyan-400 hover:to-blue-600'} {isShaking
							? 'animate-shake'
							: ''}"
					>
						<!-- แสงวิบวับพาดผ่านปุ่มตอน Hover -->
						<div
							class="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full"
						></div>
						<span
							class="relative z-10 flex items-center justify-center gap-2 drop-shadow-[0_2px_2px_rgba(0,0,0,0.3)]"
						>
							<span
								>{isPosterReelSpinning ? 'กำลังหมุนวงล้อ...' : 'ไม่ถูกใจหรอ? สุ่มใหม่อีกที!'}</span
							>
						</span>
					</button>

					<button
						type="button"
						onclick={closeRandomModal}
						class="cursor-pointer rounded-2xl border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-gray-300 shadow-lg backdrop-blur-md transition-all hover:bg-white/15 hover:text-white active:scale-95"
					>
						ปิด
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}

<!-- Modal ดูรายละเอียดหนัง/ซีรีส์ -->
{#if isDetailModalOpen}
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
			<!-- ปุ่มปิด X มุมขวาบน (เฉพาะมือถือ) -->
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
				<div class="flex h-64 flex-col items-center justify-center text-gray-400">
					<span class="mb-4 animate-bounce text-4xl">🍿</span>
					<p>กำลังโหลดใจเย็น ๆ</p>
				</div>
			{:else if selectedMovieDetails}
				<div
					class="flex min-h-0 flex-1 [scrollbar-width:none] flex-col overflow-y-auto [-ms-overflow-style:none] md:flex-row md:overflow-hidden [&::-webkit-scrollbar]:hidden"
				>
					<!-- โปสเตอร์ด้านซ้าย -->
					<div class="relative w-full flex-shrink-0 bg-black/40 md:w-1/3">
						{#if selectedMovieDetails.poster_path}
							<img
								src="https://image.tmdb.org/t/p/w500{selectedMovieDetails.poster_path}"
								alt={selectedMovieDetails.title || selectedMovieDetails.name}
								class="h-full w-full object-cover"
							/>
						{:else}
							<div class="flex h-full min-h-[300px] items-center justify-center text-gray-500">
								ไม่มีรูปภาพ
							</div>
						{/if}
					</div>

					<!-- ข้อมูลด้านขวา (เพิ่ม md:overflow-y-auto ให้เลื่อนเฉพาะฝั่งขวาบน Desktop) -->
					<div
						class="flex [scrollbar-width:none] flex-col p-6 [-ms-overflow-style:none] md:w-2/3 md:overflow-y-auto md:p-8 [&::-webkit-scrollbar]:hidden"
					>
						<div class="mb-2 flex items-center justify-between">
							<span
								class="rounded-full border border-yellow-400/30 bg-yellow-500/20 px-3 py-1 text-sm font-bold text-yellow-300"
							>
								⭐ IMDB {selectedMovieDetails.vote_average
									? selectedMovieDetails.vote_average.toFixed(1)
									: 'N/A'}
							</span>
							<span class="text-sm text-gray-400">
								{(selectedMovieDetails.release_date || selectedMovieDetails.first_air_date)?.split(
									'-'
								)[0] || 'N/A'}
							</span>
						</div>

						<h2 class="mb-4 text-2xl font-bold text-white drop-shadow-md md:text-3xl">
							{selectedMovieDetails.title || selectedMovieDetails.name}
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

						<!-- ตัวอย่าง YouTube (เพิ่ม shrink-0 กันโดนบีบความสูงเหลือ 0 บน Desktop) -->
						{#if isPlayingTrailer && trailerKey}
							<div
								class="relative isolate mb-4 aspect-video w-full shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-black shadow-2xl"
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
									✕ ปิดตัวอย่าง
								</button>
							</div>
						{:else if trailerKey}
							<button
								type="button"
								onclick={() => (isPlayingTrailer = true)}
								class="mb-4 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-red-600/90 py-2.5 text-sm font-bold text-white shadow-lg shadow-red-600/30 transition-all hover:bg-red-600 active:scale-95"
							>
								<span>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										width="16"
										height="16"
										fill="currentColor"
										class="bi bi-youtube"
										viewBox="0 0 16 16"
									>
										<path
											d="M8.051 1.999h.089c.822.003 4.987.033 6.11.335a2.01 2.01 0 0 1 1.415 1.42c.101.38.172.883.22 1.402l.01.104.022.26.008.104c.065.914.073 1.77.074 1.957v.075c-.001.194-.01 1.108-.082 2.06l-.008.105-.009.104c-.05.572-.124 1.14-.235 1.558a2.01 2.01 0 0 1-1.415 1.42c-1.16.312-5.569.334-6.18.335h-.142c-.309 0-1.587-.006-2.927-.052l-.17-.006-.087-.004-.171-.007-.171-.007c-1.11-.049-2.167-.128-2.654-.26a2.01 2.01 0 0 1-1.415-1.419c-.111-.417-.185-.986-.235-1.558L.09 9.82l-.008-.104A31 31 0 0 1 0 7.68v-.123c.002-.215.01-.958.064-1.778l.007-.103.003-.052.008-.104.022-.26.01-.104c.048-.519.119-1.023.22-1.402a2.01 2.01 0 0 1 1.415-1.42c.487-.13 1.544-.21 2.654-.26l.17-.007.172-.006.086-.003.171-.007A100 100 0 0 1 7.858 2zM6.4 5.209v4.818l4.157-2.408z"
										/>
									</svg>
								</span>
								<span>ชมตัวอย่าง{mediaType === 'movie' ? 'ภาพยนตร์' : 'ซีรีส์'} (Trailer)</span>
							</button>
						{/if}

						<!-- คำอธิบายหนัง -->
						<div class="mb-6 flex-grow">
							<h4 class="mb-2 text-sm font-semibold text-gray-400">เนื้อเรื่องย่อ</h4>
							<p class="text-sm leading-relaxed text-gray-300">
								{selectedMovieDetails.overview || 'ไม่มีคำอธิบายเนื้อเรื่องย่อสำหรับเรื่องนี้'}
							</p>
						</div>

						<!-- แพลตฟอร์มสตรีมมิ่ง -->
						<div class="mb-6">
							<h4 class="mb-3 text-sm font-semibold text-gray-400">ดูได้ที่ไหนบ้าง</h4>
							<div class="flex flex-wrap gap-3">
								{#if selectedMovieDetails['watch/providers']?.results?.TH?.flatrate}
									{#each selectedMovieDetails['watch/providers'].results.TH.flatrate as provider}
										<a
											href={getStreamingUrl(provider, selectedMovieDetails)}
											target="_blank"
											rel="noopener noreferrer"
											title="เปิดดูบน {provider.provider_name}"
											class="cursor-pointer transition-transform hover:scale-110 active:scale-95"
										>
											<img
												src="https://image.tmdb.org/t/p/w92{provider.logo_path}"
												alt={provider.provider_name}
												class="h-10 w-10 rounded-xl shadow-lg"
											/>
										</a>
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

				<!-- Footer ล็อกปุ่มปิดให้อยู่ด้านล่างสุดตลอดเวลา -->
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

<!-- Welcome Modal -->
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

<!-- ==================== SWIPE MODE MODAL ==================== -->
{#if isSwipeModeOpen}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		transition:fade={{ duration: 200 }}
		onmousemove={handleDragMove}
		onmouseup={handleDragEnd}
		onclick={(e) => {
			if (e.target === e.currentTarget) {
				isSwipeModeOpen = false;
				isDragging = false;
				currentX = 0;
			}
		}}
		class="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/85 px-4 py-6 backdrop-blur-xl select-none"
	>
		<!-- แถบด้านบน: หัวข้อ + ปุ่มเปิดคลัง + ปุ่มปิด -->
		<div class="mb-4 flex w-full max-w-sm items-center justify-between">
			<div class="flex items-center gap-2">
				<span
					class="rounded-full px-3 py-1 text-xs font-black tracking-wider text-white uppercase {mediaType ===
					'movie'
						? 'bg-gradient-to-r from-red-500 to-orange-500'
						: 'bg-gradient-to-r from-cyan-500 to-blue-600'}"
				>
					Swipe {mediaType === 'movie' ? 'Movies' : 'Series'}
				</span>
			</div>

			<div class="flex items-center gap-2">
				<!-- ปุ่มดูคลังที่ปัดไว้ -->
				<button
					type="button"
					onclick={() => (isWatchlistOpen = true)}
					class="flex cursor-pointer items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3.5 py-1.5 text-xs font-bold text-white backdrop-blur-md transition-all hover:bg-white/20 active:scale-95"
				>
					<span>คลังที่ปัดไว้</span>
					<span class="py-0.2 rounded-full bg-purple-500 px-1.5 text-[11px] font-black">
						{savedMovies.length}
					</span>
				</button>

				<!-- ปุ่มปิดโหมดปัด -->
				<button
					type="button"
					onclick={() => {
						isSwipeModeOpen = false;
						isDragging = false;
						currentX = 0;
					}}
					aria-label="ปิดโหมดปัด"
					class="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-white/15 bg-white/10 text-gray-300 transition-all hover:bg-white/20 hover:text-white active:scale-95"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						fill="none"
						viewBox="0 0 24 24"
						stroke-width="2.5"
						stroke="currentColor"
						class="h-4 w-4"
					>
						<path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
					</svg>
				</button>
			</div>
		</div>

		<!-- พื้นที่กองการ์ด -->
		<div class="relative flex h-[470px] w-full max-w-sm items-center justify-center sm:h-[510px]">
			{#if isLoadingMore && swipeCards.length === 0}
				<div
					class="flex h-full w-full flex-col items-center justify-center rounded-3xl border border-white/10 bg-white/5 text-center backdrop-blur-xl"
				>
					<span class="mb-3 animate-bounce text-4xl">🍿</span>
					<p class="text-sm font-bold text-gray-300">กำลังเตรียมการ์ดให้ปัด...</p>
				</div>
			{:else if swipeCards[currentIndex]}
				{@const currentCard = swipeCards[currentIndex]}
				{@const nextCardItem = swipeCards[currentIndex + 1]}

				<!-- การ์ดใบถัดไป (ซ้อนอยู่ด้านหลัง) -->
				{#if nextCardItem}
					<div
						class="pointer-events-none absolute inset-0 scale-95 overflow-hidden rounded-3xl border border-white/10 bg-neutral-900 opacity-50 shadow-xl transition-transform duration-300"
					>
						<img
							src={`https://image.tmdb.org/t/p/w500${nextCardItem.poster_path}`}
							alt={nextCardItem.title || nextCardItem.name}
							class="h-full w-full object-cover"
							draggable="false"
						/>
						<div
							class="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent"
						></div>
					</div>
				{/if}

				<!-- การ์ดใบปัจจุบัน (ลาก/ปัดได้) -->
				<div
					onmousedown={handleDragStart}
					ontouchstart={handleDragStart}
					ontouchmove={handleDragMove}
					ontouchend={handleDragEnd}
					style="transform: translateX({currentX}px) rotate({currentX *
						0.05}deg); transition: {isDragging
						? 'none'
						: 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)'};"
					class="relative z-10 h-full w-full cursor-grab overflow-hidden rounded-3xl border border-white/20 bg-neutral-900 shadow-[0_20px_50px_rgba(0,0,0,0.85)] active:cursor-grabbing"
				>
					<img
						src={`https://image.tmdb.org/t/p/w500${currentCard.poster_path}`}
						alt={currentCard.title || currentCard.name}
						class="pointer-events-none h-full w-full object-cover"
						draggable="false"
					/>

					<!-- แถบเงาดำด้านล่างให้อ่านตัวหนังสือชัด -->
					<div
						class="pointer-events-none absolute inset-0 bg-gradient-to-t from-black via-black/45 to-transparent"
					></div>

					<!-- ป้าย STAMP ตอนปัดขวา (เก็บเข้าคลัง) -->
					{#if currentX > 25}
						<div
							style="opacity: {Math.min((currentX - 25) / 75, 1)};"
							class="pointer-events-none absolute top-8 left-6 -rotate-12 rounded-xl border-4 border-emerald-400 bg-black/50 px-4 py-1 text-2xl font-black tracking-widest text-emerald-400 uppercase backdrop-blur-sm"
						>
							LIKE
						</div>
					{/if}

					<!-- ป้าย STAMP ตอนปัดซ้าย (ข้าม) -->
					{#if currentX < -25}
						<div
							style="opacity: {Math.min((-currentX - 25) / 75, 1)};"
							class="pointer-events-none absolute top-8 right-6 rotate-12 rounded-xl border-4 border-rose-500 bg-black/50 px-4 py-1 text-2xl font-black tracking-widest text-rose-500 uppercase backdrop-blur-sm"
						>
							NOPE
						</div>
					{/if}

					<!-- ข้อมูลเรื่องบนการ์ด -->
					<div class="absolute inset-x-0 bottom-0 p-6">
						<div class="mb-2 flex items-center gap-2">
							<span
								class="rounded-lg border border-yellow-400/30 bg-black/60 px-2.5 py-1 text-xs font-bold text-yellow-300 backdrop-blur-md"
							>
								⭐ IMDB {currentCard.vote_average ? currentCard.vote_average.toFixed(1) : 'N/A'}
							</span>
							{#if currentCard.release_date || currentCard.first_air_date}
								<span
									class="rounded-lg border border-white/15 bg-black/60 px-2.5 py-1 text-xs font-semibold text-gray-200 backdrop-blur-md"
								>
									{(currentCard.release_date || currentCard.first_air_date)?.split('-')[0]}
								</span>
							{/if}
						</div>

						<h3 class="mb-1.5 line-clamp-2 text-2xl font-black text-white drop-shadow">
							{currentCard.title || currentCard.name}
						</h3>

						<p class="line-clamp-2 text-xs leading-relaxed text-gray-300">
							{currentCard.overview || 'ไม่มีคำอธิบายเนื้อเรื่องย่อ'}
						</p>
					</div>
				</div>
			{:else}
				<div
					class="flex h-full w-full flex-col items-center justify-center rounded-3xl border border-white/10 bg-white/5 p-6 text-center backdrop-blur-xl"
				>
					<p class="mb-4 text-sm text-gray-300">หมดการ์ดในกองแล้ว โหลดเพิ่มได้เลย</p>
					<button
						type="button"
						onclick={fetchMoreSwipeCards}
						class="cursor-pointer rounded-full bg-white px-6 py-2.5 text-xs font-bold text-black transition-transform active:scale-95"
					>
						โหลดการ์ดเพิ่ม
					</button>
				</div>
			{/if}
		</div>

		<!-- ปุ่มควบคุมด้านล่าง (ข้าม / ดูรายละเอียด / เก็บเข้าคลัง) -->
		{#if swipeCards[currentIndex]}
			{@const activeCard = swipeCards[currentIndex]}
			<div class="mt-6 flex items-center justify-center gap-5">
				<!-- ปุ่มข้าม (ปัดซ้าย) -->
				<button
					type="button"
					onclick={nextCard}
					title="ไม่สนใจ (ข้าม)"
					class="flex h-14 w-14 cursor-pointer items-center justify-center rounded-full border border-rose-500/30 bg-rose-500/15 text-rose-400 shadow-lg backdrop-blur-md transition-all hover:scale-110 hover:bg-rose-500 hover:text-white active:scale-95"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						fill="none"
						viewBox="0 0 24 24"
						stroke-width="2.5"
						stroke="currentColor"
						class="h-7 w-7"
					>
						<path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
					</svg>
				</button>

				<!-- ปุ่มดูรายละเอียด & ตัวอย่าง -->
				<button
					type="button"
					onclick={() => openMovieDetails(activeCard.id, mediaType)}
					title="ดูรายละเอียด / ตัวอย่าง"
					class="flex h-12 w-12 cursor-pointer items-center justify-center rounded-full border border-white/20 bg-white/10 text-white shadow-lg backdrop-blur-md transition-all hover:scale-110 hover:bg-white/25 active:scale-95"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						fill="none"
						viewBox="0 0 24 24"
						stroke-width="2"
						stroke="currentColor"
						class="h-5 w-5"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z"
						/>
					</svg>
				</button>

				<!-- ปุ่มเก็บเข้าคลัง (ปัดขวา) -->
				<button
					type="button"
					onclick={() => {
						if (!savedMovies.some((m: any) => m.id === activeCard.id)) {
							savedMovies.push(activeCard);
							syncLocalStorage();
						}
						nextCard();
					}}
					title="เก็บเข้าคลังที่ปัดไว้"
					class="flex h-14 w-14 cursor-pointer items-center justify-center rounded-full border border-emerald-400/30 bg-emerald-500/15 text-emerald-400 shadow-lg backdrop-blur-md transition-all hover:scale-110 hover:bg-emerald-500 hover:text-white active:scale-95"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						viewBox="0 0 24 24"
						fill="currentColor"
						class="h-7 w-7"
					>
						<path
							d="m11.645 20.91-.007-.003-.022-.012a15.247 15.247 0 0 1-.383-.218 25.18 25.18 0 0 1-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0 1 12 5.052 5.5 5.5 0 0 1 16.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 0 1-4.244 3.17 15.247 15.247 0 0 1-.383.219l-.022.012-.007.004-.003.001a.752.752 0 0 1-.704 0l-.003-.001Z"
						/>
					</svg>
				</button>
			</div>
		{/if}
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

	@keyframes poster-reel {
		0% {
			transform: translateY(0%);
		}
		95%,
		100% {
			transform: translateY(-1500%);
		}
	}

	.animate-poster-reel {
		animation: poster-reel 2.5s cubic-bezier(0.15, 0.85, 0.35, 1) forwards;
	}

	@keyframes fadeInUpSmooth {
		from {
			opacity: 0;
			transform: translateY(30px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.fade-in-card {
		animation: fadeInUpSmooth 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
	}
</style>
