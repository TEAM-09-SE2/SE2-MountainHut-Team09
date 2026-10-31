import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import SlotCapacity from "./pages/SlotCapacity";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/staff/slots" element={<SlotCapacity />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
