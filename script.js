const audioPlayer = document.getElementById('audio-player');
const playBtn = document.getElementById('play');
const currentTrackDiv = document.getElementById('current-track');
let currentStations = [];
let currentStationIndex = -1;
let searchTimeout = null;
let isSearchResults = false;
let favorites = (JSON.parse(localStorage.getItem('favorites')) || []).map(fav => ({
    name: fav.name,
    url: fav.url,
    bitrate: fav.bitrate || fav.bit_rate || null,
    codec: fav.codec || '',
    votes: fav.votes || 0,
    favicon: fav.favicon || '',
    tags: fav.tags || ''
}));
const searchInput = document.getElementById('searchInput');
const volumeSlider = document.getElementById('volume');
const notification = document.getElementById('notification');
const stationListElement = document.getElementById('station-list');
const categoriesGrid = document.querySelector('.categories');
const backButton = document.querySelector('.back-btn');
const playbackStatusEl = document.getElementById('playback-status');
const currentMetaEl = document.getElementById('current-meta');
const stationArtEl = document.getElementById('station-art');
const DEFAULT_ART = 'TuneTracker.svg';
const VOLUME_STORAGE_KEY = 'tunetracker-volume';
const backgroundImages = [
    'backgrounds/aj-rivera-iZtcyFF1sDM-unsplash.jpg',
    'backgrounds/amritansh-dubey-1eWgAktO2_Y-unsplash.jpg',
    'backgrounds/amritansh-dubey-Vq7pqdCN0Bo-unsplash.jpg',
    'backgrounds/background1.png',
    'backgrounds/danny-taing-oWMMRXJS4Ak-unsplash.jpg',
    'backgrounds/flavio-mori-vdkDCxSRQSY-unsplash.jpg',
    'backgrounds/haley-truong-KB6liFYE3ao-unsplash.jpg',
    'backgrounds/joel-de-vriend-qZ6if8WXl7E-unsplash.jpg',
    'backgrounds/julian-lozano-7KsEAafSnWk-unsplash.jpg',
    'backgrounds/luca-ferrario-btwfiqepL_A-unsplash.jpg',
    'backgrounds/nico-herrndobler-WtUxXuDlNi4-unsplash.jpg'
];

function escapeHtml(text = '') {
    const safeText = String(text);
    return safeText.replace(/[&<>"']/g, (char) => {
        switch (char) {
            case '&':
                return '&amp;';
            case '<':
                return '&lt;';
            case '>':
                return '&gt;';
            case '"':
                return '&quot;';
            case "'":
                return '&#39;';
            default:
                return char;
        }
    });
}

function setPlaybackStatus(message) {
    if (playbackStatusEl) {
        playbackStatusEl.textContent = message;
    }
}

function setStationArt(source) {
    if (!stationArtEl) return;
    if (source) {
        let resolvedSource = source.trim();
        if (resolvedSource.startsWith('//')) {
            resolvedSource = `https:${resolvedSource}`;
        }
        if (resolvedSource.startsWith('http') || resolvedSource.startsWith('data:')) {
            stationArtEl.src = resolvedSource;
            stationArtEl.alt = 'Current station artwork';
            return;
        }
    }

    stationArtEl.src = DEFAULT_ART;
    stationArtEl.alt = 'TuneTracker Logo';
}

function updateNowPlayingInfo(station) {
    if (!station) {
        currentTrackDiv.textContent = 'Select a station';
        if (currentMetaEl) {
            currentMetaEl.textContent = '';
        }
        setStationArt(null);
        setPlaybackStatus('Idle');
        return;
    }

    currentTrackDiv.textContent = station.name;
    const metaParts = [];
    if (station.codec) {
        metaParts.push(station.codec.toUpperCase());
    }
    if (station.bitrate) {
        metaParts.push(`${station.bitrate} kbps`);
    }
    if (station.tags) {
        const trimmedTags = station.tags.split(',').map(tag => tag.trim()).filter(Boolean).slice(0, 2);
        if (trimmedTags.length) {
            metaParts.push(trimmedTags.join(', '));
        }
    }
    if (currentMetaEl) {
        currentMetaEl.textContent = metaParts.join(' • ');
    }
    setStationArt(station.favicon);
}
function highlightPlayingStation(index) {
    if (!stationListElement) return;
    stationListElement.querySelectorAll('.station').forEach((stationEl, stationIndex) => {
        stationEl.classList.toggle('playing', stationIndex === index);
    });
}

function showStationView() {
    if (!categoriesGrid || !backButton || !stationListElement) return;
    categoriesGrid.style.display = 'none';
    backButton.style.display = 'block';
    stationListElement.style.display = 'block';
}

function showCategoriesView() {
    if (!categoriesGrid || !backButton || !stationListElement) return;
    categoriesGrid.style.display = 'grid';
    backButton.style.display = 'none';
    stationListElement.style.display = 'none';
    stationListElement.innerHTML = '';
}

function filterVisibleStations(searchTerm) {
    if (!stationListElement) return;
    const normalizedTerm = searchTerm.trim().toLowerCase();
    stationListElement.querySelectorAll('.station').forEach((stationEl) => {
        const encodedName = stationEl.getAttribute('data-name') || '';
        let decodedName = '';
        try {
            decodedName = decodeURIComponent(encodedName);
        } catch (error) {
            decodedName = encodedName;
        }
        stationEl.style.display = decodedName.includes(normalizedTerm) ? 'flex' : 'none';
    });
}

function renderStationList(stations = []) {
    if (!stationListElement) return;

    if (!stations.length) {
        stationListElement.innerHTML = '<li class="station">No stations found</li>';
        return;
    }

    stationListElement.innerHTML = stations.map((station, index) => {
        const isPlaying = audioPlayer.src === station.url && !audioPlayer.paused;
        const isFavorite = isInFavorites(station.name, station.url);
        const metaParts = [];
        if (station.codec) metaParts.push(station.codec.toUpperCase());
        if (station.bitrate) metaParts.push(`${station.bitrate} kbps`);
        if (station.tags) {
            const tags = station.tags.split(',').map(tag => tag.trim()).filter(Boolean).slice(0, 2);
            if (tags.length) {
                metaParts.push(tags.join(', '));
            }
        }
        const meta = metaParts.join(' • ');

        return `
            <li class="station ${isPlaying ? 'playing' : ''}" role="button" tabindex="0"
                data-index="${index}" data-name="${encodeURIComponent(station.name.toLowerCase())}">
                <div class="station-details">
                    <span class="station-name">${escapeHtml(station.name)}</span>
                    ${meta ? `<span class="station-info">${escapeHtml(meta)}</span>` : ''}
                </div>
                <div class="station-controls">
                    <button type="button" class="heart ${isFavorite ? 'active' : ''}" 
                        aria-label="${isFavorite ? 'Remove from favorites' : 'Add to favorites'}"
                        aria-pressed="${isFavorite}"
                        data-index="${index}">
                        ♥
                    </button>
                </div>
            </li>
        `;
    }).join('');

    highlightPlayingStation(currentStationIndex);
}

function handleStationSelection(index) {
    if (Number.isNaN(index)) return;
    playStation(index);
}

if (stationListElement) {
    stationListElement.addEventListener('click', (event) => {
        const heartBtn = event.target.closest('.heart');
        if (heartBtn) {
            event.stopPropagation();
            const index = Number(heartBtn.dataset.index);
            const station = currentStations[index];
            if (station) {
                toggleFavorite(station.name, station.url);
            }
            return;
        }

        const stationItem = event.target.closest('.station');
        if (!stationItem) return;
        const index = Number(stationItem.dataset.index);
        handleStationSelection(index);
    });

    stationListElement.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        const stationItem = event.target.closest('.station');
        if (!stationItem) return;
        event.preventDefault();
        const index = Number(stationItem.dataset.index);
        handleStationSelection(index);
    });
}

function handleBackNavigation() {
    searchInput.value = '';
    isSearchResults = false;
    if (searchTimeout) {
        clearTimeout(searchTimeout);
        searchTimeout = null;
    }
    showCategoriesView();
}

if (backButton) {
    backButton.setAttribute('role', 'button');
    backButton.setAttribute('tabindex', '0');
    backButton.addEventListener('click', handleBackNavigation);
    backButton.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            handleBackNavigation();
        }
    });
}

// Volume control
const storedVolume = localStorage.getItem(VOLUME_STORAGE_KEY);
if (storedVolume !== null) {
    volumeSlider.value = storedVolume;
    audioPlayer.volume = storedVolume / 100;
} else {
    audioPlayer.volume = volumeSlider.value / 100;
}

volumeSlider.addEventListener('input', (e) => {
    const volumeValue = e.target.value;
    audioPlayer.volume = volumeValue / 100;
    localStorage.setItem(VOLUME_STORAGE_KEY, volumeValue);
});

// Show notification function
function showNotification(message, duration = 3000) {
    notification.textContent = message;
    notification.style.display = 'block';
    
    setTimeout(() => {
        notification.style.display = 'none';
    }, duration);
}

// Fetch radio stations from Radio Browser API
async function fetchRadioBrowserStations(category) {
    // First, get list of available servers
    let servers = [];
    try {
        const response = await fetch('https://all.api.radio-browser.info/json/servers');
        const serverData = await response.json();
        // Randomize the list of servers and extract just the names
        servers = serverData
            .sort(() => Math.random() - 0.5)
            .map(server => `https://${server.name}`);
    } catch (error) {
        console.error('Error getting server list:', error);
        // Fallback to a list of known servers if DNS lookup fails
        servers = [
            'https://de1.api.radio-browser.info',
            'https://de2.api.radio-browser.info',
            'https://fr1.api.radio-browser.info',
            'https://nl1.api.radio-browser.info',
            'https://at1.api.radio-browser.info'
        ];
    }

    // Try each server until one works
    for (const server of servers) {
        try {
            const apiUrl = `${server}/json/stations/bytagexact/${encodeURIComponent(category.toLowerCase())}`;
            
            const params = new URLSearchParams({
                limit: '100',
                order: 'votes',
                reverse: 'true',
                hidebroken: 'true',
                offset: '0',
                codec: 'mp3,aac',
                has_extended_info: 'true'
            });

            console.log('Trying server:', server);

            const response = await fetch(`${apiUrl}?${params}`, {
                method: 'GET',
                headers: {
                    'User-Agent': 'TuneTracker/1.0',
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const stations = await response.json();
            console.log(`Received ${stations.length} stations for ${category} from ${server}`);

            // Filter and sort stations by multiple criteria
            return stations
                .filter(station => 
                    station.url_resolved && 
                    station.name && 
                    !station.broken &&
                    station.bitrate >= 64 &&
                    station.votes > 0
                )
                .sort((a, b) => {
                    const votesDiff = b.votes - a.votes;
                    if (votesDiff !== 0) return votesDiff;
                    return b.bitrate - a.bitrate;
                })
                .map(station => ({
                    name: station.name,
                    url: station.url_resolved,
                    bitrate: station.bitrate,
                    codec: station.codec,
                    votes: station.votes,
                    favicon: station.favicon,
                    tags: station.tags
                }));
        } catch (error) {
            console.error(`Error with server ${server}:`, error);
            // Continue to next server
            continue;
        }
    }

    // If we get here, all servers failed
    console.error('All servers failed to respond');
    return [];
}

// Load stations for a category
async function loadStations(categoryId) {
    console.log('Loading stations for category:', categoryId);
    if (!stationListElement) return;
    stationListElement.innerHTML = '<li class="station">Loading stations...</li>';

    if (categoryId === 'favorites') {
        displayFavorites();
        return;
    }

    try {
        const stations = await fetchRadioBrowserStations(categoryId);
        currentStations = stations;
        isSearchResults = false;
        
        if (stations.length === 0) {
            stationListElement.innerHTML = '<li class="station">No stations found</li>';
            showStationView();
            return;
        }

        renderStationList(stations);
        showStationView();
    } catch (error) {
        console.error('Error loading stations:', error);
        stationListElement.innerHTML = '<li class="station">Error loading stations. Please try again.</li>';
        showStationView();
    }
}

// Function to check if a station is in favorites
function isInFavorites(name, url) {
    return favorites.some(fav => fav.name === name && fav.url === url);
}

// Function to display favorites
function displayFavorites() {
    if (!stationListElement) return;
    
    // Hide categories and show back button
    showStationView();

    if (favorites.length === 0) {
        stationListElement.innerHTML = '<li class="station">No favorites yet</li>';
        return;
    }

    currentStations = favorites;
    isSearchResults = false;
    renderStationList(favorites);
}

// Function to play a station
async function playStation(index) {
    try {
        const station = currentStations[index];
        if (!station) {
            showNotification('Station not found');
            return;
        }

        currentStationIndex = index;
        currentTrackDiv.classList.add('connecting');
        currentTrackDiv.textContent = '';
        setPlaybackStatus('Connecting…');

        audioPlayer.src = station.url;

        try {
            await audioPlayer.play();
            currentTrackDiv.classList.remove('connecting');
            updateNowPlayingInfo(station);
            playBtn.textContent = '⏸';
            highlightPlayingStation(index);
        } catch (error) {
            console.error('Error playing station:', error);
            showNotification('Unable to connect to this station. Please try another one.');
            currentTrackDiv.classList.remove('connecting');
            updateNowPlayingInfo(null);
            playBtn.textContent = '⏵';
        }
    } catch (error) {
        console.error('Error in playStation:', error);
        showNotification('Error playing station. Please try another one.');
        currentTrackDiv.classList.remove('connecting');
        updateNowPlayingInfo(null);
    }
}

// Function to toggle favorite
function toggleFavorite(name, url) {
    const index = favorites.findIndex(fav => fav.name === name && fav.url === url);
    if (index !== -1) {
        favorites.splice(index, 1);
    } else {
        const sourceStation = currentStations.find(station => station.name === name && station.url === url);
        favorites.push(sourceStation ? { ...sourceStation } : { name, url });
    }
    localStorage.setItem('favorites', JSON.stringify(favorites));

    if (stationListElement && stationListElement.style.display === 'block') {
        renderStationList(currentStations);
        highlightPlayingStation(currentStationIndex);
    }
}

// Function to get random station
async function getRandomStation() {
    // First try to get from favorites
    if (favorites.length > 0 && Math.random() < 0.3) { // 30% chance to play from favorites
        const randomIndex = Math.floor(Math.random() * favorites.length);
        return { station: favorites[randomIndex], index: randomIndex, fromFavorites: true };
    }

    // If no favorites or didn't select from favorites, get random category and station
    const categories = Array.from(document.querySelectorAll('.category'))
        .map(cat => cat.getAttribute('data-category'))
        .filter(cat => cat && cat !== 'favorites');
    
    const randomCategory = categories[Math.floor(Math.random() * categories.length)];
    
    try {
        const stations = await fetchRadioBrowserStations(randomCategory);
        if (stations.length > 0) {
            const randomIndex = Math.floor(Math.random() * stations.length);
            return { station: stations[randomIndex], index: randomIndex, fromFavorites: false, category: randomCategory };
        }
    } catch (error) {
        console.error('Error fetching random station:', error);
    }
    return null;
}

// Function to play random station
async function playRandomStation() {
    const randomStationData = await getRandomStation();
    if (!randomStationData) return;

    const { station, fromFavorites, category } = randomStationData;
    
    if (!fromFavorites) {
        // Load the category first
        await loadStations(category);
    } else {
        displayFavorites();
    }

    // Find the station in the current list and play it
    const stationIndex = currentStations.findIndex(s => 
        s.name === station.name && s.url === station.url
    );
    
    if (stationIndex !== -1) {
        playStation(stationIndex);
    }
}

// Function to play previous station
async function playPreviousStation() {
    if (!audioPlayer.src) return;
    await playRandomStation();
}

// Function to play next station
async function playNextStation() {
    if (!audioPlayer.src) return;
    await playRandomStation();
}

// Add API search functionality
async function searchStationsAPI(searchTerm) {
    try {
        const response = await fetch(`https://de1.api.radio-browser.info/json/stations/search?name=${encodeURIComponent(searchTerm)}&limit=100`, {
            method: 'GET',
            headers: {
                'User-Agent': 'RadioPlayerWebApp/1.0',
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const stations = await response.json();
        return stations
            .filter(station => 
                station.url_resolved && 
                station.name && 
                !station.broken &&
                station.bitrate >= 64 &&
                station.votes > 0
            )
            .sort((a, b) => {
                const votesDiff = b.votes - a.votes;
                if (votesDiff !== 0) return votesDiff;
                return b.bitrate - a.bitrate;
            })
            .map(station => ({
                name: station.name,
                url: station.url_resolved,
                bitrate: station.bitrate,
                codec: station.codec,
                votes: station.votes,
                favicon: station.favicon,
                tags: station.tags
            }));
    } catch (error) {
        console.error('Error searching stations:', error);
        return [];
    }
}

function handleSearchInput(event) {
    if (!stationListElement) return;
    const searchTerm = event.target.value.trim().toLowerCase();
    const isListFromCategory = categoriesGrid && categoriesGrid.style.display === 'none' && !isSearchResults;

    if (isListFromCategory) {
        filterVisibleStations(searchTerm);
        return;
    }

    if (searchTerm.length < 2) {
        if (isSearchResults) {
            isSearchResults = false;
            showCategoriesView();
        }
        return;
    }

    if (searchTimeout) {
        clearTimeout(searchTimeout);
    }

    const latestTerm = searchTerm;
    searchTimeout = setTimeout(async () => {
        if (searchInput.value.trim().toLowerCase() !== latestTerm) {
            return;
        }

        showStationView();
        stationListElement.innerHTML = '<li class="station">Searching...</li>';

        const stations = await searchStationsAPI(latestTerm);
        currentStations = stations;
        isSearchResults = true;
        renderStationList(stations);
        searchTimeout = null;
    }, 400);
}

searchInput.addEventListener('input', handleSearchInput);

// Update play button event listener
playBtn.addEventListener('click', async () => {
    if (!audioPlayer.src) {
        // If no station is selected, play a random one
        await playRandomStation();
    } else {
        // Toggle play/pause for current station
        if (audioPlayer.paused) {
            audioPlayer.play();
            playBtn.textContent = '⏸';
        } else {
            audioPlayer.pause();
            playBtn.textContent = '⏵';
        }
    }
});

// Add keyboard shortcuts for controls
document.addEventListener('keydown', async (e) => {
    if (e.code === 'Space') {
        e.preventDefault();
        if (!audioPlayer.src) {
            await playRandomStation();
        } else {
            if (audioPlayer.paused) {
                audioPlayer.play();
                playBtn.textContent = '⏸';
            } else {
                audioPlayer.pause();
                playBtn.textContent = '⏵';
            }
        }
    } else if (e.code === 'ArrowLeft') {
        await playPreviousStation();
    } else if (e.code === 'ArrowRight') {
        await playNextStation();
    }
});

// Add event listener for audio player error
audioPlayer.addEventListener('error', () => {
    showNotification('Stream unavailable. Please try another station.');
    updateNowPlayingInfo(null);
    playBtn.textContent = '⏵';
    highlightPlayingStation(-1);
    currentStationIndex = -1;
    setPlaybackStatus('Error');
});

audioPlayer.addEventListener('loadstart', () => setPlaybackStatus('Connecting…'));
audioPlayer.addEventListener('waiting', () => setPlaybackStatus('Buffering…'));
audioPlayer.addEventListener('stalled', () => setPlaybackStatus('Reconnecting…'));
audioPlayer.addEventListener('playing', () => setPlaybackStatus('Live'));
audioPlayer.addEventListener('pause', () => {
    setPlaybackStatus(audioPlayer.currentTime > 0 ? 'Paused' : 'Idle');
});
audioPlayer.addEventListener('ended', () => setPlaybackStatus('Ended'));

// Search functionality handled via handleSearchInput

// Background slideshow helpers
function getRandomBackground(exclude) {
    const pool = backgroundImages.filter(image => image !== exclude);
    const source = pool.length ? pool : backgroundImages;
    const randomIndex = Math.floor(Math.random() * source.length);
    return source[randomIndex];
}

function initBackgroundSlideshow() {
    const layers = document.querySelectorAll('.background-layer');
    if (layers.length < 2 || backgroundImages.length === 0) {
        return;
    }

    let activeLayerIndex = 0;
    let currentBackground = getRandomBackground();

    layers.forEach(layer => {
        layer.style.backgroundImage = `url('${currentBackground}')`;
    });
    layers[activeLayerIndex].classList.add('active');

    setInterval(() => {
        const nextLayerIndex = (activeLayerIndex + 1) % layers.length;
        const nextBackground = getRandomBackground(currentBackground);

        layers[nextLayerIndex].style.backgroundImage = `url('${nextBackground}')`;
        layers[nextLayerIndex].classList.add('active');
        layers[activeLayerIndex].classList.remove('active');

        activeLayerIndex = nextLayerIndex;
        currentBackground = nextBackground;
    }, 10000);
}

// Initialize the app
document.addEventListener('DOMContentLoaded', () => {
    updateNowPlayingInfo(null);

    // Start rotating backgrounds
    initBackgroundSlideshow();

    // Add click handler for categories
    document.querySelectorAll('.category').forEach(category => {
        category.setAttribute('role', 'button');
        category.setAttribute('tabindex', '0');
        category.addEventListener('click', () => {
            const categoryId = category.getAttribute('data-category');
            if (categoryId) {
                console.log('Loading category:', categoryId);
                searchInput.value = '';
                isSearchResults = false;
                if (searchTimeout) {
                    clearTimeout(searchTimeout);
                    searchTimeout = null;
                }
                loadStations(categoryId);
            }
        });
        category.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                category.click();
            }
        });
    });

    // Initially hide the back button
    if (backButton) {
        backButton.style.display = 'none';
    }
});

