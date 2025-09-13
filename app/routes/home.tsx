import { Routes, Route } from "react-router";
import { BoardProvider } from "~/components/BoardContext";
import Header from "~/components/Header";
import Board from "~/components/Board";

export default function App() {
  return (
    <BoardProvider>
      <Header />
      <Routes>
        <Route path="/" element={<Board />} />
      </Routes>
    </BoardProvider>
  );
}
