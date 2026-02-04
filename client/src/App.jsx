import { RouterProvider, createBrowserRouter, useNavigate } from "react-router-dom";
import { Dashboard, HomeLayout, Landing, Login, Logout, Register, Events, EventDetail } from "./pages";
import { ToastContainer, toast } from "react-toastify";
import { AuthProvider } from "./context/AuthContext";
import { useEffect } from "react";

const router = createBrowserRouter([
  {
    path: "/",
    element: <HomeLayout />,
    children: [
      {
        index: true,
        element: <Landing />,
      },
      {
        path: "login",
        element: <Login />,
      },
      {
        path: "register",
        element: <Register />,
      },
      {
        path: "dashboard",
        element: <Dashboard />,
      },
      {
        path: "events",
        element: <Events />,
      },
      {
        path: "events/:id",
        element: <EventDetail />,
      },
      {
        path: "logout",
        element: <Logout />,
      }
    ],
  },
]);

function App() {
  useEffect(() => {
    // Handle payment success redirect
    const params = new URLSearchParams(window.location.search);
    if (params.get("payment") === "success") {
      const intentId = params.get("intentId");
      toast.success("Payment confirmed! Your wallet has been credited.", { autoClose: 3000 });
      // Clear the query params
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  return (
    <AuthProvider>
      <RouterProvider router={router} />
      <ToastContainer position="top-center" />
    </AuthProvider>
  );
}

export default App
