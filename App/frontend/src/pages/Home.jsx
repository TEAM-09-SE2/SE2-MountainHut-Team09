import React, { useState } from 'react';
import { 
  Mountain, 
  Calendar, 
  Map, 
  Utensils, 
  Info,
  X,
  Phone,
  Mail,
  Instagram,
  Facebook,
  AlertCircle,
  Loader2,
  RefreshCcw,
  CheckCircle2,
  Navigation,
  Route,
  Cloud
} from 'lucide-react';

// --- Custom Toast for User Actions ---
const Toast = ({ message, visible, onClose }) => {
  if (!visible) return null;
  return (
    <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-top-4 duration-300">
      <div className="bg-slate-900 text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 border border-slate-700">
        <Info className="w-5 h-5 text-emerald-400" />
        <span className="font-medium text-sm">{message}</span>
        <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors ml-2">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default function App() {
  const [toastConfig, setToastConfig] = useState({ visible: false, message: '' });
  const [availabilityState, setAvailabilityState] = useState('success'); // 'success' | 'loading' | 'empty' | 'error'

  const handleAction = (message) => {
    setToastConfig({ visible: true, message });
    setTimeout(() => {
      setToastConfig(prev => ({ ...prev, visible: false }));
    }, 3000);
  };

  const scrollToSection = (id, message) => {
    handleAction(message);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-white font-sans text-slate-900 max-w-[1440px] mx-auto shadow-xl overflow-x-hidden relative">
      <Toast 
        visible={toastConfig.visible} 
        message={toastConfig.message} 
        onClose={() => setToastConfig({ ...toastConfig, visible: false })} 
      />

      {/* --- 1. Top Bar --- */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-gray-100 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="h-16 grid grid-cols-4 lg:grid-cols-12 items-center gap-4">
            
            {/* Logo & Name */}
            <div 
              className="col-span-2 lg:col-span-3 flex items-center gap-2.5 cursor-pointer" 
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            >
              <div className="p-1.5 bg-emerald-100 rounded-lg text-emerald-700">
                <Mountain className="w-6 h-6" />
              </div>
              <span className="font-bold text-lg tracking-tight text-slate-900">Skyreach Hut</span>
            </div>

            {/* Navigation */}
            <nav className="hidden lg:flex col-span-6 justify-center space-x-8">
              <a href="#" className="text-sm font-medium text-slate-600 hover:text-emerald-700 transition-colors">Home</a>
              <a href="#how-it-works" className="text-sm font-medium text-slate-600 hover:text-emerald-700 transition-colors">The Hut</a>
              <a href="#trails" className="text-sm font-medium text-slate-600 hover:text-emerald-700 transition-colors">Trails</a>
              <a href="#contact" className="text-sm font-medium text-slate-600 hover:text-emerald-700 transition-colors">Contact</a>
            </nav>

            {/* User Actions */}
            <div className="col-span-2 lg:col-span-3 flex justify-end items-center gap-3">
              <button 
                onClick={() => handleAction("Navigating to Login screen...")}
                className="text-sm font-medium text-slate-700 hover:text-slate-900 px-2 py-2 hidden sm:block transition-colors"
              >
                Login
              </button>
              <button 
                onClick={() => handleAction("Navigating to Registration screen...")}
                className="text-sm font-medium bg-emerald-700 text-white px-4 py-2 rounded-md hover:bg-emerald-800 transition-colors shadow-sm"
              >
                Register
              </button>
            </div>
          </div>
        </div>
      </header>

      <main>
        {/* --- 2. Hero Section --- */}
        <section className="py-12 lg:py-20 bg-white overflow-hidden">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-4 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
              
              {/* Text Content */}
              <div className="col-span-4 lg:col-span-5 order-2 lg:order-1">
                <div className="inline-flex items-center gap-2 bg-emerald-50 text-emerald-700 border border-emerald-200/60 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider mb-4">
                  <Cloud className="w-3.5 h-3.5" />
                  <span>Altitude 2,500m</span>
                </div>
                
                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-slate-900 tracking-tight mb-6 leading-tight">
                  High-altitude hospitality for trail lovers.
                </h1>
                
                <p className="text-lg sm:text-xl text-slate-600 mb-8 leading-relaxed">
                  Step above the sky. Disconnect from the valley, breathe the mountain air, and savor authentic local alpine dining perched high on the ridge line.
                </p>
                
                <div className="flex flex-col sm:flex-row gap-4">
                  <button 
                    onClick={() => handleAction("Initiating MH-01 Flow: Book Now")}
                    className="bg-emerald-600 text-white px-8 py-4 rounded-lg font-semibold text-lg hover:bg-emerald-500 transition-all shadow-md hover:shadow-lg text-center"
                  >
                    Book now
                  </button>
                  <button 
                    onClick={() => scrollToSection('availability', 'Initiating MH-04 Flow: Checking availability')}
                    className="bg-white text-slate-700 border border-slate-300 px-8 py-4 rounded-lg font-semibold text-lg hover:bg-slate-50 transition-colors text-center"
                  >
                    Check availability
                  </button>
                </div>
              </div>

              {/* Hero Image */}
              <div className="col-span-4 lg:col-span-7 order-1 lg:order-2 relative">
                <div className="relative rounded-2xl overflow-hidden shadow-2xl border border-slate-100">
                  <img 
                    src="/images/rifugio.jpg" 
                    alt="Skyreach Hut" 
                    className="w-full h-[420px] object-cover hover:scale-105 transition-transform duration-700"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent"></div>
                </div>
              </div>

            </div>
          </div>
        </section>

        {/* --- 3. How it Works Section --- */}
        <section id="how-it-works" className="py-20 bg-slate-50 border-y border-gray-100">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold text-slate-900 mb-4">How it works</h2>
              <p className="text-slate-600">Booking your table at Skyreach Hut is simple.</p>
            </div>
            
            <div className="grid grid-cols-4 lg:grid-cols-12 gap-6 lg:gap-8">
              {/* Step 1 */}
              <div className="col-span-4 lg:col-span-4 bg-white p-8 rounded-2xl shadow-sm border border-gray-100 text-center">
                <div className="w-14 h-14 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Calendar className="w-7 h-7" />
                </div>
                <h3 className="text-xl font-semibold text-slate-900 mb-2">1. Choose Dates</h3>
                <p className="text-slate-600">Check our calendar for available shifts during the open season.</p>
              </div>

              {/* Step 2 */}
              <div className="col-span-4 lg:col-span-4 bg-white p-8 rounded-2xl shadow-sm border border-gray-100 text-center">
                <div className="w-14 h-14 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Utensils className="w-7 h-7" />
                </div>
                <h3 className="text-xl font-semibold text-slate-900 mb-2">2. Select a Slot</h3>
                <p className="text-slate-600">Reserve your table for lunch or dinner based on remaining seats.</p>
              </div>

              {/* Step 3 */}
              <div className="col-span-4 lg:col-span-4 bg-white p-8 rounded-2xl shadow-sm border border-gray-100 text-center">
                <div className="w-14 h-14 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Map className="w-7 h-7" />
                </div>
                <h3 className="text-xl font-semibold text-slate-900 mb-2">3. Hike & Enjoy</h3>
                <p className="text-slate-600">Follow the trail, arrive at 2,500m altitude, and let us serve you.</p>
              </div>
            </div>
          </div>
        </section>

        {/* --- 4. Upcoming Availability Section --- */}
        <section id="availability" className="py-20 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            
            <div className="mb-10">
              <h2 className="text-3xl font-bold text-slate-900 mb-2">Upcoming availability</h2>
              <p className="text-slate-600">A quick glance at slots in the next few days.</p>
            </div>

            <div className="grid grid-cols-4 lg:grid-cols-12 gap-6">
              <div className="col-span-4 lg:col-span-12 min-h-[220px]">
                
                {/* STATE: SUCCESS */}
                {availabilityState === 'success' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {/* Slot Card 1 */}
                    <div className="border border-gray-200 rounded-xl p-5 hover:border-emerald-500 transition-colors bg-white shadow-xs">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <p className="text-sm font-semibold text-emerald-700 mb-1">Sat, Aug 12</p>
                          <h4 className="text-lg font-bold text-slate-900">Lunch Shift</h4>
                        </div>
                        <span className="bg-emerald-50 text-emerald-700 text-xs font-bold px-2.5 py-1 rounded-full">Available</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-slate-600 mb-4">
                        <Utensils className="w-4 h-4" />
                        <span>12:00 PM - 1:30 PM</span>
                      </div>
                      <div className="pt-4 border-t border-gray-100 flex justify-between items-center">
                        <span className="text-sm font-medium text-slate-700">12 seats left</span>
                        <button onClick={() => handleAction("MH-01 Flow: Pre-selected Aug 12 Lunch")} className="text-sm text-emerald-700 font-semibold hover:underline">Book slot</button>
                      </div>
                    </div>

                    {/* Slot Card 2 */}
                    <div className="border border-gray-200 rounded-xl p-5 hover:border-emerald-500 transition-colors bg-white shadow-xs">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <p className="text-sm font-semibold text-emerald-700 mb-1">Sat, Aug 12</p>
                          <h4 className="text-lg font-bold text-slate-900">Dinner Shift</h4>
                        </div>
                        <span className="bg-orange-50 text-orange-700 text-xs font-bold px-2.5 py-1 rounded-full">Few Seats</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-slate-600 mb-4">
                        <Utensils className="w-4 h-4" />
                        <span>7:00 PM - 8:30 PM</span>
                      </div>
                      <div className="pt-4 border-t border-gray-100 flex justify-between items-center">
                        <span className="text-sm font-medium text-orange-700">4 seats left</span>
                        <button onClick={() => handleAction("MH-01 Flow: Pre-selected Aug 12 Dinner")} className="text-sm text-emerald-700 font-semibold hover:underline">Book slot</button>
                      </div>
                    </div>

                    {/* Slot Card 3 */}
                    <div className="border border-gray-200 rounded-xl p-5 hover:border-emerald-500 transition-colors bg-white shadow-xs">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <p className="text-sm font-semibold text-emerald-700 mb-1">Sun, Aug 13</p>
                          <h4 className="text-lg font-bold text-slate-900">Lunch Shift</h4>
                        </div>
                        <span className="bg-emerald-50 text-emerald-700 text-xs font-bold px-2.5 py-1 rounded-full">Available</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-slate-600 mb-4">
                        <Utensils className="w-4 h-4" />
                        <span>12:00 PM - 1:30 PM</span>
                      </div>
                      <div className="pt-4 border-t border-gray-100 flex justify-between items-center">
                        <span className="text-sm font-medium text-slate-700">18 seats left</span>
                        <button onClick={() => handleAction("MH-01 Flow: Pre-selected Aug 13 Lunch")} className="text-sm text-emerald-700 font-semibold hover:underline">Book slot</button>
                      </div>
                    </div>
                  </div>
                )}

                {/* STATE: LOADING */}
                {availabilityState === 'loading' && (
                  <div className="flex flex-col items-center justify-center h-48 bg-slate-50 rounded-2xl border border-gray-100 border-dashed">
                    <Loader2 className="w-8 h-8 text-emerald-600 animate-spin mb-4" />
                    <p className="text-slate-600 font-medium">Checking live availability at Skyreach Hut...</p>
                  </div>
                )}

                {/* STATE: EMPTY */}
                {availabilityState === 'empty' && (
                  <div className="flex flex-col items-center justify-center h-48 bg-slate-50 rounded-2xl border border-gray-100 text-center p-6">
                    <CheckCircle2 className="w-10 h-10 text-slate-400 mb-3" />
                    <h4 className="text-lg font-bold text-slate-900 mb-1">No upcoming slots available</h4>
                    <p className="text-slate-600 max-w-sm">Skyreach Hut is fully booked for the next few days. Please check the full calendar for future dates.</p>
                    <button 
                      onClick={() => handleAction("MH-04 Flow: Full Calendar view")}
                      className="mt-4 text-emerald-700 font-semibold hover:underline"
                    >
                      View full calendar
                    </button>
                  </div>
                )}

                {/* STATE: ERROR */}
                {availabilityState === 'error' && (
                  <div className="flex flex-col items-center justify-center h-48 bg-red-50 rounded-2xl border border-red-100 text-center p-6">
                    <AlertCircle className="w-10 h-10 text-red-500 mb-3" />
                    <h4 className="text-lg font-bold text-slate-900 mb-1">Could not load availability</h4>
                    <p className="text-slate-600 max-w-sm mb-4">There was a problem connecting to the hut booking system. Please try again.</p>
                    <button 
                      onClick={() => {
                        setAvailabilityState('loading');
                        setTimeout(() => setAvailabilityState('success'), 1200);
                      }}
                      className="flex items-center gap-2 bg-white border border-gray-300 text-slate-700 px-4 py-2 rounded-lg font-medium hover:bg-gray-50 transition-colors"
                    >
                      <RefreshCcw className="w-4 h-4" /> Retry
                    </button>
                  </div>
                )}

              </div>
            </div>
          </div>
        </section>

        {/* --- 5. Trails & How to Reach Us Section --- */}
        <section id="trails" className="py-20 bg-slate-50 border-t border-gray-100">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold text-slate-900 mb-4">How to Reach Skyreach Hut</h2>
              <p className="text-slate-600">Choose your trail route to 2,500m altitude.</p>
            </div>

            <div className="grid grid-cols-4 lg:grid-cols-12 gap-6 lg:gap-8">
              {/* Trail 1 */}
              <div className="col-span-4 lg:col-span-6 bg-white p-8 rounded-2xl border border-gray-100 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-3 bg-emerald-100 rounded-xl text-emerald-700">
                    <Navigation className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-xl text-slate-900">Trail CAI 401 (Ridge Route)</h3>
                    <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">Classic Alpine Hike</span>
                  </div>
                </div>
                <p className="text-slate-600 text-sm mb-6 leading-relaxed">
                  A scenic mountain trail starting from the valley floor parking lot. Offers panoramic ridge views for experienced hikers.
                </p>
                <div className="grid grid-cols-2 gap-4 text-sm border-t border-gray-100 pt-4">
                  <div>
                    <span className="text-slate-400 block text-xs">Start Point</span>
                    <strong className="text-slate-800">Valley Parking (1,200m)</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-xs">Elevation Gain</span>
                    <strong className="text-slate-800">+1,300m</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-xs">Duration</span>
                    <strong className="text-slate-800">3h 30m</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-xs">Difficulty</span>
                    <strong className="text-emerald-700">Moderate / Hard</strong>
                  </div>
                </div>
              </div>

              {/* Trail 2 */}
              <div className="col-span-4 lg:col-span-6 bg-white p-8 rounded-2xl border border-gray-100 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-3 bg-emerald-100 rounded-xl text-emerald-700">
                    <Route className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-xl text-slate-900">Cable Car + Ridge Walk</h3>
                    <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">Scenic Direct Route</span>
                  </div>
                </div>
                <p className="text-slate-600 text-sm mb-6 leading-relaxed">
                  Take the Cloudcrest cable car to the upper station, followed by a pleasant 45-minute trail walk along the ridge.
                </p>
                <div className="grid grid-cols-2 gap-4 text-sm border-t border-gray-100 pt-4">
                  <div>
                    <span className="text-slate-400 block text-xs">Start Point</span>
                    <strong className="text-slate-800">Cable Car Station (2,200m)</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-xs">Elevation Gain</span>
                    <strong className="text-slate-800">+300m</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-xs">Duration</span>
                    <strong className="text-slate-800">45 minutes</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-xs">Difficulty</span>
                    <strong className="text-emerald-700">Easy</strong>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-8 bg-amber-50 border border-amber-200 p-4 rounded-xl flex gap-3 text-amber-800 text-sm max-w-4xl mx-auto">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-amber-600" />
              <p><strong>Weather Advisory:</strong> Mountain weather at 2,500m can shift rapidly. Check mountain forecasts before ascending and bring windproof gear.</p>
            </div>
          </div>
        </section>
      </main>

      {/* --- 6. Footer --- */}
      <footer id="contact" className="bg-slate-900 text-slate-300 py-16 border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-4 lg:grid-cols-12 gap-8 lg:gap-12">
            
            {/* Hut Info */}
            <div className="col-span-4 lg:col-span-4">
              <div className="flex items-center gap-2.5 text-white mb-6">
                <div className="p-1.5 bg-emerald-500/20 rounded-lg text-emerald-400">
                  <Mountain className="w-6 h-6" />
                </div>
                <span className="font-bold text-lg tracking-tight">Skyreach Hut</span>
              </div>
              <p className="text-sm text-slate-400 mb-6 leading-relaxed">
                Cloudcrest Ridge, 2,500m Altitude.<br/>
                High-altitude dining for hikers, climbers, and trail enthusiasts.
              </p>
              <div className="space-y-3 text-sm">
                <div className="flex items-center gap-3">
                  <Phone className="w-4 h-4 text-emerald-500" />
                  <span>+39 0165 889 250</span>
                </div>
                <div className="flex items-center gap-3">
                  <Mail className="w-4 h-4 text-emerald-500" />
                  <span>info@skyreachhut.com</span>
                </div>
              </div>
            </div>

            {/* Legal Links */}
            <div className="col-span-2 lg:col-span-4 lg:col-start-7">
              <h4 className="text-white font-semibold mb-6">Legal & Info</h4>
              <ul className="space-y-3 text-sm">
                <li><a href="#" className="hover:text-emerald-400 transition-colors">Terms of Service</a></li>
                <li><a href="#" className="hover:text-emerald-400 transition-colors">Privacy Policy</a></li>
                <li><a href="#" className="hover:text-emerald-400 transition-colors">Cancellation Policy</a></li>
                <li><a href="#" className="hover:text-emerald-400 transition-colors">Hut Rules</a></li>
              </ul>
            </div>

            {/* Social Links */}
            <div className="col-span-2 lg:col-span-2 text-right lg:text-left">
              <h4 className="text-white font-semibold mb-6">Follow Us</h4>
              <div className="flex lg:flex-col gap-4 lg:gap-3 justify-end lg:justify-start">
                <a href="#" className="flex items-center gap-2 hover:text-emerald-400 transition-colors">
                  <Instagram className="w-5 h-5" />
                  <span className="hidden lg:inline text-sm">Instagram</span>
                </a>
                <a href="#" className="flex items-center gap-2 hover:text-emerald-400 transition-colors">
                  <Facebook className="w-5 h-5" />
                  <span className="hidden lg:inline text-sm">Facebook</span>
                </a>
              </div>
            </div>
          </div>
          
          <div className="mt-16 pt-8 border-t border-slate-800 text-xs text-slate-500 flex flex-col md:flex-row justify-between items-center gap-4">
            <p>© 2026 Skyreach Hut. All rights reserved.</p>
            <p>Software Engineering II - SE2-MountainHut-Team09</p>
          </div>
        </div>
      </footer>
    </div>
  );
}