import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import BookTableWizard from './components/booking/BookTableWizard';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/book-table" element={<BookTableWizard />} />
      </Routes>
    </Router>
  );
}

export default App;