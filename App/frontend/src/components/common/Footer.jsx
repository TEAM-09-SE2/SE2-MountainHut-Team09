import React from 'react';
import { Mountain, Phone, Mail, Instagram, Facebook } from 'lucide-react';

export default function Footer() {
  return (
    <footer id="contact" className="bg-slate-900 text-slate-300 py-16 border-t border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-4 lg:grid-cols-12 gap-8 lg:gap-12">
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

          <div className="col-span-2 lg:col-span-4 lg:col-start-7">
            <h4 className="text-white font-semibold mb-6 text-sm uppercase tracking-wider">Legal & Info</h4>
            <ul className="space-y-3 text-sm">
              <li><a href="#" className="hover:text-emerald-400 transition-colors">Terms of Service</a></li>
              <li><a href="#" className="hover:text-emerald-400 transition-colors">Privacy Policy</a></li>
              <li><a href="#" className="hover:text-emerald-400 transition-colors">Cancellation Policy</a></li>
              <li><a href="#" className="hover:text-emerald-400 transition-colors">Hut Rules</a></li>
            </ul>
          </div>

          <div className="col-span-2 lg:col-span-2 text-right lg:text-left">
            <h4 className="text-white font-semibold mb-6 text-sm uppercase tracking-wider">Follow Us</h4>
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
          <p>Software Engineering II — SE2-MountainHut-Team09</p>
        </div>
      </div>
    </footer>
  );
}