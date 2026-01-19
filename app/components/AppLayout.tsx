/**
 * Layout for the app pages.
 */
import Header from "./Header";
import { Outlet } from "react-router";

export default function AppLayout() {
  return (
    <div className='text-gray-100 min-h-screen flex flex-col'>
      <Header />
      <Outlet />
    </div>
  );
}