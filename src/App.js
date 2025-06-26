import React, { useState, useEffect, useMemo, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { 
    getAuth, 
    signInAnonymously, 
    onAuthStateChanged,
    signInWithCustomToken
} from 'firebase/auth';
import { 
    getFirestore, 
    collection, 
    doc, 
    addDoc, 
    updateDoc, 
    onSnapshot,
    serverTimestamp,
    setLogLevel
} from 'firebase/firestore';
import { Trash2, Plus, Camera, MapPin, LogIn, LogOut, X, Map, List } from 'lucide-react';

// --- Leaflet Integration ---
// We will dynamically load the Leaflet CSS file.
const leafletCSSId = 'leaflet-css';
if (!document.getElementById(leafletCSSId)) {
    const link = document.createElement('link');
    link.id = leafletCSSId;
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    link.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
    link.crossOrigin = '';
    document.head.appendChild(link);
}

// --- Firebase Configuration ---
const firebaseConfig = typeof __firebase_config !== 'undefined' 
    ? JSON.parse(__firebase_config) 
    : { apiKey: "your-fallback-api-key", authDomain: "...", projectId: "..." };

// --- App ID ---
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-camera-tracker';

// --- Main App Component ---
export default function App() {
    // --- State Management ---
    const [db, setDb] = useState(null);
    const [auth, setAuth] = useState(null);
    const [userId, setUserId] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);
    
    const [cameras, setCameras] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isCheckOutModalOpen, setIsCheckOutModalOpen] = useState(false);
    const [selectedCamera, setSelectedCamera] = useState(null);
    
    const [viewMode, setViewMode] = useState('cards'); // 'cards' or 'map'

    // --- Firebase Initialization and Authentication Effect ---
    useEffect(() => {
        try {
            const app = initializeApp(firebaseConfig);
            const firestoreDb = getFirestore(app);
            const firebaseAuth = getAuth(app);
            
            setDb(firestoreDb);
            setAuth(firebaseAuth);

            const unsubscribe = onAuthStateChanged(firebaseAuth, async (user) => {
                if (user) {
                    setUserId(user.uid);
                } else {
                    try {
                        const token = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
                        if (token) {
                            await signInWithCustomToken(firebaseAuth, token);
                        } else {
                            await signInAnonymously(firebaseAuth);
                        }
                    } catch (authError) {
                        console.error("Authentication Error:", authError);
                        setError("Failed to authenticate. Please refresh the page.");
                    }
                }
                setIsAuthReady(true);
            });

            return () => unsubscribe();
        } catch (e) {
            console.error("Firebase Initialization Error:", e);
            setError("Could not connect to the database. Please check configuration.");
            setIsLoading(false);
        }
    }, []);

    // --- Firestore Data Fetching Effect ---
    useEffect(() => {
        if (!isAuthReady || !db) return;

        setIsLoading(true);
        const camerasCollectionPath = `artifacts/${appId}/public/data/cameras`;
        const q = collection(db, camerasCollectionPath);

        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const camerasData = [];
            querySnapshot.forEach((doc) => {
                camerasData.push({ id: doc.id, ...doc.data() });
            });
            camerasData.sort((a, b) => a.cameraNumber.localeCompare(b.cameraNumber, undefined, { numeric: true }));
            setCameras(camerasData);
            setIsLoading(false);
        }, (err) => {
            console.error("Firestore Snapshot Error:", err);
            setError("Failed to fetch camera data.");
            setIsLoading(false);
        });

        return () => unsubscribe();
    }, [isAuthReady, db]);
    
    // --- Firestore Actions ---
    const handleAddCamera = async (cameraNumber) => {
        if (!db || !cameraNumber) return;
        try {
            const camerasCollectionPath = `artifacts/${appId}/public/data/cameras`;
            await addDoc(collection(db, camerasCollectionPath), {
                cameraNumber: cameraNumber,
                status: 'available',
                location: '',
                geolocation: { lat: '', lng: '' },
                checkedOutTimestamp: null,
                checkedOutBy: ''
            });
            setIsAddModalOpen(false);
        } catch (e) {
            console.error("Error adding camera: ", e);
            setError("Could not add the camera.");
        }
    };

    const handleCheckOut = async (locationData) => {
        if (!db || !selectedCamera || !userId) return;
        try {
            const cameraDocRef = doc(db, `artifacts/${appId}/public/data/cameras`, selectedCamera.id);
            await updateDoc(cameraDocRef, {
                status: 'in_use',
                location: locationData.location,
                geolocation: {
                    lat: locationData.lat,
                    lng: locationData.lng
                },
                checkedOutTimestamp: serverTimestamp(),
                checkedOutBy: userId
            });
            setIsCheckOutModalOpen(false);
            setSelectedCamera(null);
        } catch (e) {
            console.error("Error checking out camera: ", e);
            setError("Could not check out the camera.");
        }
    };

    const handleCheckIn = async (camera) => {
        if (!db) return;
        try {
            const cameraDocRef = doc(db, `artifacts/${appId}/public/data/cameras`, camera.id);
            await updateDoc(cameraDocRef, {
                status: 'available',
                location: '',
                geolocation: { lat: '', lng: '' },
                checkedOutTimestamp: null,
                checkedOutBy: ''
            });
        } catch (e) {
            console.error("Error checking in camera: ", e);
            setError("Could not check in the camera.");
        }
    };
    
    const handleDeleteCamera = async (camera) => {
        if (!db) return;
        if (camera.status === 'in_use') {
            setError("Cannot delete a camera that is currently in use.");
            setTimeout(() => setError(null), 3000);
            return;
        }
        try {
            const cameraDocRef = doc(db, `artifacts/${appId}/public/data/cameras`, camera.id);
            // In a real app, you would use: await deleteDoc(cameraDocRef); 
            console.log(`Deletion requested for camera: ${camera.id}. Deletion is disabled in this demo.`);
            setError(`Deletion for ${camera.cameraNumber} is disabled in this demo.`);
            setTimeout(() => setError(null), 5000);
        } catch (e) {
            console.error("Error deleting camera: ", e);
            setError("Could not delete the camera.");
        }
    };

    const inUseCameras = useMemo(() => 
        cameras.filter(c => c.status === 'in_use' && c.geolocation?.lat && c.geolocation?.lng),
    [cameras]);

    return (
        <div className="bg-gray-900 text-white min-h-screen font-sans">
            <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
                <Header 
                    onAddCamera={() => setIsAddModalOpen(true)} 
                    userId={userId} 
                    viewMode={viewMode}
                    setViewMode={setViewMode}
                />

                {error && <ErrorMessage message={error} onClose={() => setError(null)} />}

                {isLoading ? (
                    <LoadingSpinner />
                ) : (
                    <div className="mt-6">
                        {viewMode === 'cards' && (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                {cameras.length > 0 ? cameras.map(camera => (
                                    <CameraCard 
                                        key={camera.id} 
                                        camera={camera} 
                                        onCheckOut={() => { setSelectedCamera(camera); setIsCheckOutModalOpen(true); }}
                                        onCheckIn={() => handleCheckIn(camera)}
                                        onDelete={() => handleDeleteCamera(camera)}
                                    />
                                )) : <EmptyState />}
                            </div>
                        )}
                         {viewMode === 'map' && <MapView cameras={inUseCameras} />}
                    </div>
                )}
            </div>

            {isAddModalOpen && <AddCameraModal onClose={() => setIsAddModalOpen(false)} onAdd={handleAddCamera} />}
            {isCheckOutModalOpen && selectedCamera && <CheckOutModal camera={selectedCamera} onClose={() => setIsCheckOutModalOpen(false)} onCheckOut={handleCheckOut} />}
        </div>
    );
}

// --- Sub-Components ---

function Header({ onAddCamera, userId, viewMode, setViewMode }) {
    return (
        <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 border-b border-gray-700">
            <div>
                 <h1 className="text-3xl font-bold text-cyan-400">Camera & Trap Tracker</h1>
                <p className="text-gray-400 mt-1">Real-time status of all field cameras.</p>
                {userId && (
                    <p className="text-xs text-gray-500 mt-2 bg-gray-800 px-2 py-1 rounded-md inline-block">
                        Your User ID: <span className="font-mono text-yellow-400">{userId}</span>
                    </p>
                )}
            </div>
            <div className="flex items-center space-x-2 mt-4 sm:mt-0">
                 <button
                    onClick={() => setViewMode(viewMode === 'cards' ? 'map' : 'cards')}
                    className="flex items-center bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg shadow-lg transition-colors"
                >
                    {viewMode === 'cards' ? <Map size={20} className="mr-2" /> : <List size={20} className="mr-2" />}
                    {viewMode === 'cards' ? 'Map View' : 'Card View'}
                </button>
                <button
                    onClick={onAddCamera}
                    className="flex items-center bg-cyan-500 hover:bg-cyan-600 text-white font-bold py-2 px-4 rounded-lg shadow-lg transition-transform transform hover:scale-105"
                >
                    <Plus size={20} className="mr-2" />
                    Add Camera
                </button>
            </div>
        </header>
    );
}

function MapView({ cameras }) {
    const mapContainerRef = useRef(null);
    const mapInstanceRef = useRef(null);
    const markersRef = useRef([]);
    const [isLeafletLoaded, setIsLeafletLoaded] = useState(!!window.L);

    useEffect(() => {
        if (isLeafletLoaded) return;
        
        const script = document.createElement('script');
        script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
        script.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
        script.crossOrigin = '';
        script.onload = () => setIsLeafletLoaded(true);
        document.body.appendChild(script);

        return () => {
            document.body.removeChild(script);
        };
    }, [isLeafletLoaded]);

    useEffect(() => {
        if (!isLeafletLoaded || !mapContainerRef.current || mapInstanceRef.current) return;

        mapInstanceRef.current = window.L.map(mapContainerRef.current).setView([39.8283, -98.5795], 4); // Centered on USA

        window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(mapInstanceRef.current);

    }, [isLeafletLoaded]);

    useEffect(() => {
        if (!mapInstanceRef.current || !isLeafletLoaded) return;
        
        // Invalidate map size to ensure it renders correctly after being displayed
        mapInstanceRef.current.invalidateSize();

        // Clear existing markers
        markersRef.current.forEach(marker => marker.remove());
        markersRef.current = [];

        if (cameras.length === 0) return;

        const cameraIcon = window.L.divIcon({
            html: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-camera" style="background-color: #0891b2; border-radius: 50%; padding: 4px; box-shadow: 0 0 8px #0891b2;"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"></path><circle cx="12" cy="13" r="3"></circle></svg>`,
            className: '',
            iconSize: [32, 32],
            iconAnchor: [16, 32]
        });


        const bounds = [];
        cameras.forEach(camera => {
            const lat = parseFloat(camera.geolocation.lat);
            const lng = parseFloat(camera.geolocation.lng);

            if (!isNaN(lat) && !isNaN(lng)) {
                const marker = window.L.marker([lat, lng], {icon: cameraIcon}).addTo(mapInstanceRef.current);
                marker.bindPopup(
                    `<b>${camera.cameraNumber}</b><br>${camera.location}`
                );
                markersRef.current.push(marker);
                bounds.push([lat, lng]);
            }
        });

        if (bounds.length > 0) {
            mapInstanceRef.current.fitBounds(bounds, { padding: [50, 50] });
        }

    }, [cameras, isLeafletLoaded]);

    if (!isLeafletLoaded) {
        return <LoadingSpinner />;
    }
    
    if (cameras.length === 0) {
         return (
            <div className="text-center py-20 px-6 bg-gray-800 rounded-lg">
                <MapPin size={48} className="mx-auto text-gray-500" />
                <h3 className="mt-4 text-xl font-semibold text-white">No Active Cameras on Map</h3>
                <p className="mt-2 text-gray-400">Check out a camera with a valid geo-location to see it here.</p>
            </div>
        );
    }

    return <div ref={mapContainerRef} className="h-[65vh] w-full rounded-lg z-0" />;
}


function CameraCard({ camera, onCheckOut, onCheckIn, onDelete }) {
    const isAvailable = camera.status === 'available';
    const timestamp = camera.checkedOutTimestamp?.toDate();
    
    return (
        <div className={`bg-gray-800 rounded-lg shadow-xl border ${isAvailable ? 'border-green-500/50' : 'border-yellow-500/50'} flex flex-col transition-all duration-300 hover:shadow-cyan-500/20 hover:border-cyan-400`}>
            <div className="p-5 flex-grow">
                <div className="flex justify-between items-start">
                    <h2 className="text-xl font-bold text-white flex items-center">
                        <Camera className="mr-3 text-cyan-400" />
                        {camera.cameraNumber}
                    </h2>
                    <span className={`px-3 py-1 text-sm font-semibold rounded-full ${isAvailable ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                        {isAvailable ? 'Available' : 'In Use'}
                    </span>
                </div>
                {!isAvailable && (
                    <div className="mt-4 space-y-3 text-gray-300">
                        <div className="flex items-start">
                            <MapPin size={18} className="mr-3 mt-1 text-gray-500 flex-shrink-0" />
                            <div>
                                <p className="font-semibold text-white">{camera.location}</p>
                                {camera.geolocation?.lat && camera.geolocation?.lng &&
                                    <p className="text-xs text-gray-400 font-mono">
                                        {`Lat: ${camera.geolocation.lat}, Lng: ${camera.geolocation.lng}`}
                                    </p>
                                }
                            </div>
                        </div>
                        {timestamp && 
                            <p className="text-xs text-gray-400">
                                Checked out on {timestamp.toLocaleDateString()} at {timestamp.toLocaleTimeString()}
                            </p>
                        }
                        {camera.checkedOutBy &&
                            <p className="text-xs text-gray-500 font-mono" title={camera.checkedOutBy}>
                                By: {camera.checkedOutBy.substring(0, 12)}...
                            </p>
                        }
                    </div>
                )}
            </div>
            <div className="bg-gray-800/50 p-3 flex items-center justify-between rounded-b-lg border-t border-gray-700">
                {isAvailable ? (
                    <>
                        <button onClick={onCheckOut} className="w-full flex items-center justify-center bg-yellow-500 hover:bg-yellow-600 text-gray-900 font-bold py-2 px-4 rounded-md transition-colors">
                            <LogOut size={18} className="mr-2" />
                            Check Out
                        </button>
                         <button onClick={onDelete} className="ml-2 p-2 text-gray-500 hover:text-red-500 transition-colors">
                            <Trash2 size={18}/>
                        </button>
                    </>
                ) : (
                    <button onClick={onCheckIn} className="w-full flex items-center justify-center bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-md transition-colors">
                        <LogIn size={18} className="mr-2" />
                        Check In
                    </button>
                )}
            </div>
        </div>
    );
}

function Modal({ children, onClose, title }) {
    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50 p-4">
            <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-md border border-gray-700">
                <div className="flex justify-between items-center p-4 border-b border-gray-700">
                    <h3 className="text-xl font-bold text-cyan-400">{title}</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-white">
                        <X size={24} />
                    </button>
                </div>
                <div className="p-6">
                    {children}
                </div>
            </div>
        </div>
    );
}

function AddCameraModal({ onClose, onAdd }) {
    const [cameraNumber, setCameraNumber] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        if (cameraNumber.trim()) {
            onAdd(cameraNumber.trim());
        }
    };

    return (
        <Modal onClose={onClose} title="Add New Camera">
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label htmlFor="cameraNumber" className="block text-sm font-medium text-gray-300 mb-1">Camera Number / ID</label>
                    <input
                        id="cameraNumber"
                        type="text"
                        value={cameraNumber}
                        onChange={(e) => setCameraNumber(e.target.value)}
                        placeholder="e.g., CAM-017 or VZ-3489"
                        autoFocus
                        className="w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    />
                </div>
                <div className="flex justify-end pt-2">
                    <button type="submit" className="bg-cyan-500 hover:bg-cyan-600 text-white font-bold py-2 px-6 rounded-md transition-colors">
                        Add Camera
                    </button>
                </div>
            </form>
        </Modal>
    );
}

function CheckOutModal({ camera, onClose, onCheckOut }) {
    const [location, setLocation] = useState('');
    const [lat, setLat] = useState('');
    const [lng, setLng] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        if (location.trim()) {
            onCheckOut({ location: location.trim(), lat, lng });
        }
    };
    
    const handleGetGeo = () => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    setLat(position.coords.latitude.toFixed(6));
                    setLng(position.coords.longitude.toFixed(6));
                },
                (error) => {
                    // Replaced alert with a console warning
                    console.warn(`Geolocation error: ${error.message}. Could not get location. Please enable location services or enter manually.`);
                }
            );
        } else {
            // Replaced alert with a console warning
             console.warn("Geolocation is not supported by this browser.");
        }
    };

    return (
        <Modal onClose={onClose} title={`Check Out: ${camera.cameraNumber}`}>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label htmlFor="location" className="block text-sm font-medium text-gray-300 mb-1">Customer/Job Location</label>
                    <input
                        id="location"
                        type="text"
                        value={location}
                        onChange={(e) => setLocation(e.target.value)}
                        placeholder="e.g., 123 Main St, Attic"
                        autoFocus
                        className="w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    />
                </div>
                <div className="space-y-2">
                     <label className="block text-sm font-medium text-gray-300">Geo-Location (Optional)</label>
                     <div className="flex items-center space-x-2">
                        <input type="text" value={lat} onChange={e => setLat(e.target.value)} placeholder="Latitude" className="w-1/2 bg-gray-900 border border-gray-600 rounded-md px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"/>
                        <input type="text" value={lng} onChange={e => setLng(e.target.value)} placeholder="Longitude" className="w-1/2 bg-gray-900 border border-gray-600 rounded-md px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"/>
                        <button type="button" onClick={handleGetGeo} className="p-2 bg-gray-700 hover:bg-gray-600 rounded-md" title="Get Current Location">
                            <MapPin size={20} />
                        </button>
                    </div>
                </div>
                <div className="flex justify-end pt-2">
                    <button type="submit" className="bg-yellow-500 hover:bg-yellow-600 text-gray-900 font-bold py-2 px-6 rounded-md transition-colors">
                        Check Out
                    </button>
                </div>
            </form>
        </Modal>
    );
}

function LoadingSpinner() {
    return (
        <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-cyan-400"></div>
        </div>
    );
}

function EmptyState() {
    return (
        <div className="col-span-full text-center py-20 px-6 bg-gray-800 rounded-lg mt-6">
            <Camera size={48} className="mx-auto text-gray-500" />
            <h3 className="mt-4 text-xl font-semibold text-white">No Cameras in Inventory</h3>
            <p className="mt-2 text-gray-400">Click "Add New Camera" to get started and build your inventory.</p>
        </div>
    );
}

function ErrorMessage({ message, onClose }) {
    return (
        <div className="my-4 p-4 bg-red-500/20 border border-red-500/50 text-red-300 rounded-lg flex justify-between items-center">
            <p>{message}</p>
            <button onClick={onClose} className="text-red-300 hover:text-white">
                <X size={20} />
            </button>
        </div>
    );
}
