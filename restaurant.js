import { sleep, check, group } from "k6";
import http from "k6/http";
import { Rate, Counter, Trend } from "k6/metrics";
import { randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';

// Custom metrics
const errors = new Rate("errors");
const orderProcessed = Counter("orders_processed");
const processingTime = Trend("order_processing_time");

// Configuration
const BASE_URL = "http://localhost:8765";
const RESTAURANT_ID = "6711074323ad9d42043cff5e";
const STAFF_ID = "8589f685-8161-4743-92d7-4d1908e2133d";

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
        { duration: "5m", target: 5000 }, // Ramp up to 5000 users
        { duration: "10m", target: 5000 }, // Stay at 5000 users
        { duration: "5m", target: 0 }, // Ramp down to 0
      ],
      gracefulRampDown: "30s",
      tags: { scenario: "load" },
    },

    // Scenario 3: Stress test
    stress_test: {
      executor: "ramping-order-rate",
      startRate: 1000,
      timeUnit: "1s",
      preAllocatedVUs: 5000,
      maxVUs: 10000,
      stages: [
        { duration: "2m", target: 1000 }, // Keep steady at 1000 RPS
        { duration: "5m", target: 5000 }, // Ramp up to 5000 RPS
        { duration: "2m", target: 5000 }, // Stay at 5000 RPS
        { duration: "2m", target: 8000 }, // Peak at 8000 RPS
        { duration: "3m", target: 0 }, // Ramp down to 0
      ],
      tags: { scenario: "stress" },
    },

    // Scenario 4: Soak test
    soak_test: {
      executor: "constant-vus",
      vus: 3000,
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

function checkResponse(response, requestName) {
  const checkResult = check(response, {
    [`${requestName} status is 200`]: (r) => r.status === 200,
    [`${requestName} response time < 500ms`]: (r) => r.timings.duration < 500,
    [`${requestName} has valid response`]: (r) => r.body && r.body.length > 0,
  });

  if (!checkResult) {
    console.error(`${requestName} failed:`, {
      status: response.status,
      body: response.body,
      timings: response.timings,
    });
    errors.add(1);
  }
  return checkResult;
}

export function setup() {
  const loginResponse = http.post(
    `${BASE_URL}/user/login`,
    JSON.stringify({
      email: "shop1@mail.com",
      password: "shop1",
    }),
    {
      headers: { "Content-Type": "application/json" },
      tags: { name: "login" },
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
      tags: { type: "restaurant_staff" },
    };
  
    group("Restaurant Staff Operations", () => {
      const restaurantsResponse = http.get(
        `${BASE_URL}/restaurant-service/restaurants/all`,
        params
      );
  
      if (!checkResponse(restaurantsResponse, "Get Restaurants")) {
        return;
      }
  
      const ordersResponse = http.get(
        `${BASE_URL}/groupFoodOrdersAPI/getOrdersForRestaurantStaff?userId=${STAFF_ID}&restaurantId=${RESTAURANT_ID}`,
        params
      );
  
      if (!checkResponse(ordersResponse, "Get Orders")) {
        return;
      }
  
      try {
        const orders = ordersResponse.json();
        console.log(`Processing ${orders.length} orders`);
  
        // Process submitted orders
        orders
          .filter(order => order.orderStatus === "SUBMITTED_TO_RESTAURANT")
          .forEach(order => {
            const startTime = new Date();
            
            const acceptResponse = http.put(
              `${BASE_URL}/groupFoodOrdersAPI/kitchenPreparing/${order.groupFoodOrderId}`,
              null,
              params
            );
  
            if (checkResponse(acceptResponse, "Accept Order")) {
              orderProcessed.add(1);
              processingTime.add(new Date() - startTime);
            }
  
            sleep(randomIntBetween(1, 3));
          });
  
        // Process preparing orders
        orders
          .filter(order => order.orderStatus === "KITCHEN_PREPARING")
          .forEach(order => {
            const startTime = new Date();
            
            const readyResponse = http.put(
              `${BASE_URL}/groupFoodOrdersAPI/readyForDelivery/${order.groupFoodOrderId}`,
              null,
              params
            );
  
            if (checkResponse(readyResponse, "Ready For Delivery")) {
              orderProcessed.add(1);
              processingTime.add(new Date() - startTime);
            }
  
            sleep(randomIntBetween(1, 3));
          });
  
      } catch (error) {
        console.error("Error processing orders:", error);
        errors.add(1);
      }
    });
  
    sleep(randomIntBetween(3, 5));
  }

export function teardown(data) {
  if (!data?.authToken) return;

  const cleanupResponse = http.del(
    `${BASE_URL}/cleanup`,
    null,
    {
      headers: {
        Authorization: `Bearer ${data.authToken}`,
      },
      tags: { name: "cleanup" },
    }
  );

  checkResponse(cleanupResponse, "Cleanup");
}