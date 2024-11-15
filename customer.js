import { sleep, check } from "k6";
import http from "k6/http";
import { Rate } from "k6/metrics";

// Custom metrics
const errors = new Rate("errors");

// Configuration
const BASE_URL = "http://localhost:8765";

// Options defines different scenarios and their workload patterns
export const options = {
  scenarios: {
    // Scenario 1: Smoke test
    smoke_test: {
      executor: "constant-vus",
      vus: 1,
      duration: "1m",
      tags: { scenario: "smoke" },
    },

    // Scenario 2: Load test with ramping VUs
    load_test: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "5m", target: 50 }, // Ramp up to 50 users
        { duration: "10m", target: 50 }, // Stay at 50 users
        { duration: "5m", target: 0 }, // Ramp down to 0
      ],
      gracefulRampDown: "30s",
      tags: { scenario: "load" },
    },

    // Scenario 3: Stress test
    stress_test: {
      executor: "ramping-arrival-rate",
      startRate: 10,
      timeUnit: "1s",
      preAllocatedVUs: 50,
      maxVUs: 100,
      stages: [
        { duration: "2m", target: 10 }, // Keep steady at 10 RPS
        { duration: "5m", target: 50 }, // Ramp up to 50 RPS
        { duration: "2m", target: 50 }, // Stay at 50 RPS
        { duration: "2m", target: 80 }, // Peak at 80 RPS
        { duration: "3m", target: 0 }, // Ramp down to 0
      ],
      tags: { scenario: "stress" },
    },

    // Scenario 4: Soak test
    soak_test: {
      executor: "constant-vus",
      vus: 30,
      duration: "2h",
      tags: { scenario: "soak" },
    },
  },

  thresholds: {
    http_req_duration: ["p(95)<500"], // 95% of requests should be below 500ms
    http_req_failed: ["rate<0.01"], // Less than 1% of requests should fail
    errors: ["rate<0.05"], // Less than 5% custom error rate
  },
};

// Helper function to check response
function checkResponse(response, requestName) {
  const checkResult = check(response, {
    [`${requestName} status is 200`]: (r) => r.status === 200,
    [`${requestName} response time < 500ms`]: (r) => r.timings.duration < 500,
  });

  if (!checkResult) {
    console.error(`${requestName} failed:`, response.status, response.body);
    errors.add(1);
  }
  return checkResult;
}

export function setup() {
  const loginResponse = http.post(
    `${BASE_URL}/user/login`,
    JSON.stringify({
      email: "testcus1@mail.com",
      password: "testcus1",
    }),
    {
      headers: {
        "Content-Type": "application/json",
      },
    }
  );

  if (!checkResponse(loginResponse, "Login")) {
    throw new Error("Login failed");
  }

  return {
    authToken: loginResponse.json("token"),
  };
}

export default function (data) {
  const params = {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${data.authToken}`,
    },
  };

  // 1. Get all restaurants
  const restaurantsResponse = http.get(
    `${BASE_URL}/restaurant-service/restaurants/all`,
    params
  );

  if (!checkResponse(restaurantsResponse, "Get Restaurants")) {
    console.error("Failed to get restaurants");
    return;
  }

  // 2. Create group food order
  const orderPayload = {
    id: null,
    groupFoodOrderId: null,
    restaurantId: "6711074323ad9d42043cff5e",
    userId: "0452735e-be9a-499f-93bd-b5a661780c86",
    createdTime: null,
    orderDetails: JSON.stringify([
      {
        menuId: "6736f708dd18100640edc481",
        menuImageURL:
          "https://images.pexels.com/photos/7251866/pexels-photo-7251866.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2",
        name: "Steamed Dumplings",
        quantity: 1,
        price: 8.99,
      },
      {
        menuId: "6736f708dd18100640edc482",
        menuImageURL:
          "https://images.pexels.com/photos/7287723/pexels-photo-7287723.jpeg?auto=compress&cs=tinysrgb&w=1200",
        name: "Pan-Fried Dumplings",
        quantity: 1,
        price: 9.99,
      },
      {
        menuId: "6736f708dd18100640edc483",
        menuImageURL:
          "https://images.pexels.com/photos/5409015/pexels-photo-5409015.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2",
        name: "Dumpling Noodle Soup",
        quantity: 1,
        price: 11.99,
      },
    ]),
    location: "South",
    deliveryAddress:
      "01-01  Outram Park, Cantonment Road, People's Park, Outram, Central, Singapore, 088875, Singapore",
    deliveryLatitude: 1.280799664912132,
    deliveryLongitude: 103.83968353271486,
    deliveryFee: 5,
  };

  const orderResponse = http.post(
    `${BASE_URL}/groupFoodOrdersAPI/groupFoodOrder`,
    JSON.stringify(orderPayload),
    params
  );

  if (!checkResponse(orderResponse, "Create Group Food Order")) {
    console.error("Failed to create group food order");
    return;
  }

  // Extract order data if needed for subsequent requests like payment(paynow)
  let orderData;
  try {
    orderData = orderResponse.json();
    console.log("Order created successfully:", orderData);

    const paymentPayload = {
      orderItemId: orderData.id,
      paymentStatus: "PENDING",
      isGroupFoodOrder: true,
      isGetPromo: false,
      totalPrice: 30.97,
      forShow: false,
      paymentType: "payNow",
      creditCardNumber: "",
      expiryDate: "",
      cvv: "",
      payNowMobileNumber: "92325933",
      payLahMobileNumber: "",
    };
    const paynowResponse = http.put(
      `${BASE_URL}/order-service/UpdatePaymentStatusAPI/updatePayment`,
      JSON.stringify(paymentPayload),
      params
    );
  } catch (error) {
    console.error("Error parsing order response:", error);
  }

  // Simulate user think time
  sleep(Math.random() * 3 + 1);
}

export function teardown(data) {
  if (!data || !data.authToken) {
    console.error("No authentication data available for cleanup");
    return;
  }

  const cleanupResponse = http.del(`${BASE_URL}/cleanup`, null, {
    headers: {
      Authorization: `Bearer ${data.authToken}`,
    },
  });

  checkResponse(cleanupResponse, "Cleanup");
}
