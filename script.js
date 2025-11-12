const audioPlayer = document.getElementById('audio-player');
const playBtn = document.getElementById('play');
const prevBtn = document.getElementById('prev');
const nextBtn = document.getElementById('next');
const currentTrackDiv = document.getElementById('current-track');
let currentlyPlaying = null;
let currentStations = [];
let currentIndex = -1;
let favorites = JSON.parse(localStorage.getItem('favorites')) || [];
const searchInput = document.getElementById('searchInput');
const volumeSlider = document.getElementById('volume');
const notification = document.getElementById('notification');

// Volume control
volumeSlider.addEventListener('input', (e) => {
    audioPlayer.volume = e.target.value / 100;
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
                    votes: station.votes
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
    const stationList = document.getElementById('station-list');
    stationList.innerHTML = '<li class="station">Loading stations...</li>';

    if (categoryId === 'favorites') {
        displayFavorites();
        return;
    }

    try {
        const stations = await fetchRadioBrowserStations(categoryId);
        currentStations = stations;
        
        if (stations.length === 0) {
            stationList.innerHTML = '<li class="station">No stations found</li>';
            return;
        }

        stationList.innerHTML = stations.map((station, index) => {
            const isPlaying = audioPlayer.src === station.url && !audioPlayer.paused;
            return `
                <li class="station ${isPlaying ? 'playing' : ''}" onclick="playStation(${index})">
                    <span>${station.name}</span>
                    <div class="station-controls">
                        <span class="heart ${isInFavorites(station.name, station.url) ? 'active' : ''}" 
                              onclick="event.stopPropagation(); toggleFavorite('${station.name}', '${station.url}')">♥</span>
                    </div>
                </li>
            `;
        }).join('');

        // Show the station list and hide categories
        document.querySelector('.categories').style.display = 'none';
        document.querySelector('.back-btn').style.display = 'block';
        stationList.style.display = 'block';
    } catch (error) {
        console.error('Error loading stations:', error);
        stationList.innerHTML = '<li class="station">Error loading stations. Please try again.</li>';
    }
}

// Function to check if a station is in favorites
function isInFavorites(name, url) {
    return favorites.some(fav => fav.name === name && fav.url === url);
}

// Function to display favorites
function displayFavorites() {
    const stationList = document.getElementById('station-list');
    const categories = document.querySelector('.categories');
    
    // Hide categories and show back button
    categories.style.display = 'none';
    document.querySelector('.back-btn').style.display = 'block';

    if (favorites.length === 0) {
        stationList.innerHTML = '<li class="station">No favorites yet</li>';
        stationList.style.display = 'block';
        return;
    }

    // Display favorite stations
    stationList.innerHTML = favorites.map((station, index) => {
        const isPlaying = audioPlayer.src === station.url && !audioPlayer.paused;
        return `
            <li class="station ${isPlaying ? 'playing' : ''}" onclick="playStation(${index}, true)">
                <span>${station.name}</span>
                <div class="station-controls">
                    <span class="heart active" 
                          onclick="event.stopPropagation(); toggleFavorite('${station.name}', '${station.url}')">♥</span>
                </div>
            </li>
        `;
    }).join('');
    
    stationList.style.display = 'block';
    currentStations = favorites;
}

// Function to play a station
async function playStation(index, isFavorite = false) {
    try {
        currentStationIndex = index;
        const stations = isFavorite ? favorites : currentStations;
        const station = stations[index];
        
        if (!station) {
            showNotification('Station not found');
            return;
        }

        // Start with "Select a station"
        const currentTrackDiv = document.getElementById('current-track');
        currentTrackDiv.textContent = 'Select a station';

        // Show connecting state
        currentTrackDiv.textContent = '';
        currentTrackDiv.classList.add('connecting');

        // Update audio source and play
        audioPlayer.src = station.url;
        
        try {
            await audioPlayer.play();
            // Remove connecting animation and show station name
            currentTrackDiv.classList.remove('connecting');
            currentTrackDiv.textContent = station.name;
            playBtn.textContent = '⏸';
            
            // Update station list to show playing status
            document.querySelectorAll('.station').forEach((el, i) => {
                el.classList.toggle('playing', i === index);
            });
        } catch (error) {
            console.error('Error playing station:', error);
            showNotification('Unable to connect to this station. Please try another one.');
            currentTrackDiv.classList.remove('connecting');
            currentTrackDiv.textContent = 'Select a station';
            playBtn.textContent = '⏵';
        }
    } catch (error) {
        console.error('Error in playStation:', error);
        showNotification('Error playing station. Please try another one.');
        const currentTrackDiv = document.getElementById('current-track');
        currentTrackDiv.classList.remove('connecting');
        currentTrackDiv.textContent = 'Select a station';
    }
}

// Function to toggle favorite
function toggleFavorite(name, url) {
    const index = favorites.findIndex(fav => fav.name === name && fav.url === url);
    if (index !== -1) {
        favorites.splice(index, 1);
    } else {
        favorites.push({ name, url });
    }
    localStorage.setItem('favorites', JSON.stringify(favorites));

    // Update heart icons
    const hearts = document.querySelectorAll('.heart');
    hearts.forEach(heart => {
        const stationName = heart.closest('.station').querySelector('span').textContent;
        const stationUrl = currentStations.find(s => s.name === stationName)?.url;
        if (stationName === name && stationUrl === url) {
            heart.classList.toggle('active');
        }
    });

    // If we're in favorites view, refresh the list
    if (document.querySelector('.categories').style.display === 'none' && 
        document.getElementById('station-list').style.display === 'block') {
        displayFavorites();
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
                votes: station.votes
            }));
    } catch (error) {
        console.error('Error searching stations:', error);
        return [];
    }
}

let searchTimeout = null;

// Update search functionality
searchInput.addEventListener('input', async function(e) {
    const searchTerm = e.target.value.toLowerCase();
    const stationList = document.getElementById('station-list');
    
    if (stationList) {
        // If we're in a category view, filter the existing stations
        if (document.querySelector('.categories').style.display === 'none') {
            const stationElements = stationList.getElementsByClassName('station');
            Array.from(stationElements).forEach(station => {
                const stationName = station.querySelector('span').textContent.toLowerCase();
                if (stationName.includes(searchTerm)) {
                    station.style.display = 'flex';
                } else {
                    station.style.display = 'none';
                }
            });
        } 
        // If we're in the main view and search term is not empty, perform API search
        else if (searchTerm.length >= 2) {
            // Clear any existing timeout
            if (searchTimeout) {
                clearTimeout(searchTimeout);
            }

            // Set new timeout to prevent too many API calls
            searchTimeout = setTimeout(async () => {
                document.querySelector('.categories').style.display = 'none';
                document.querySelector('.back-btn').style.display = 'block';
                stationList.style.display = 'block';
                stationList.innerHTML = '<li class="station">Searching...</li>';

                const stations = await searchStationsAPI(searchTerm);
                currentStations = stations;

                if (stations.length === 0) {
                    stationList.innerHTML = '<li class="station">No stations found</li>';
                    return;
                }

                stationList.innerHTML = stations.map((station, index) => {
                    const isPlaying = audioPlayer.src === station.url && !audioPlayer.paused;
                    return `
                        <li class="station ${isPlaying ? 'playing' : ''}" onclick="playStation(${index})">
                            <span>${station.name}</span>
                            <div class="station-controls">
                                <span class="heart ${isInFavorites(station.name, station.url) ? 'active' : ''}" 
                                      onclick="event.stopPropagation(); toggleFavorite('${station.name}', '${station.url}')">♥</span>
                            </div>
                        </li>
                    `;
                }).join('');
            }, 500); // Wait 500ms after last keystroke before searching
        }
    }
});

// Update back button to handle search results
document.querySelector('.back-btn').addEventListener('click', () => {
    searchInput.value = '';
    document.querySelector('.categories').style.display = 'grid';
    document.querySelector('.back-btn').style.display = 'none';
    document.getElementById('station-list').style.display = 'none';
});

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

// Add event listener for back button
document.querySelector('.back-btn').addEventListener('click', () => {
    document.querySelector('.categories').style.display = 'block';
    document.querySelector('.back-btn').style.display = 'none';
    const stationList = document.getElementById('station-list');
    stationList.style.display = 'none';
    stationList.innerHTML = '';
});

// Add event listener for audio player error
audioPlayer.addEventListener('error', () => {
    showNotification('Stream unavailable. Please try another station.');
    if (currentlyPlaying) {
        currentlyPlaying = null;
        currentTrackDiv.textContent = 'Select a station';
        playBtn.textContent = '⏵';
    }
});

// Search functionality
searchInput.addEventListener('input', function(e) {
    const searchTerm = e.target.value.toLowerCase();
    const stationList = document.getElementById('station-list');
    
    if (stationList) {
        const stationElements = stationList.getElementsByClassName('station');
        
        Array.from(stationElements).forEach(station => {
            const stationName = station.querySelector('span').textContent.toLowerCase();
            if (stationName.includes(searchTerm)) {
                station.style.display = 'flex';
            } else {
                station.style.display = 'none';
            }
        });
    }
});

// Clear search when changing categories
document.querySelectorAll('.category').forEach(category => {
    category.addEventListener('click', () => {
        searchInput.value = '';
    });
});

// Clear search when clicking back
document.querySelector('.back-btn').addEventListener('click', () => {
    searchInput.value = '';
});

// Function to load random background
function loadRandomBackground() {
    // List of all background images in the backgrounds folder
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

    // Select a random background image
    const randomIndex = Math.floor(Math.random() * backgroundImages.length);
    const selectedBackground = backgroundImages[randomIndex];

    // Apply the background to the body element
    document.body.style.backgroundImage = `url('${selectedBackground}')`;
    
    console.log('Loaded random background:', selectedBackground);
}

// Initialize the app
document.addEventListener('DOMContentLoaded', () => {
    // Load random background on page load
    loadRandomBackground();

    // Add click handler for categories
    document.querySelectorAll('.category').forEach(category => {
        category.addEventListener('click', () => {
            const categoryId = category.getAttribute('data-category');
            if (categoryId) {
                console.log('Loading category:', categoryId);
                loadStations(categoryId);
            }
        });
    });

    // Initially hide the back button
    document.querySelector('.back-btn').style.display = 'none';
});

