/**
 * Frontend configuration module.
 * Set USE_MOCK_API = true to test the frontend 100% standalone in the browser
 * without running the FastAPI backend.
 */
export const CONFIG = {
  API_BASE_URL: "http://localhost:8000",
  RAZORPAY_KEY_ID: "rzp_test_xxxxxxxxxxxxxx",
  USE_MOCK_API: true,
};
