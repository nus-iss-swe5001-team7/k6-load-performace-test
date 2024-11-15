import { sleep, check, group } from "k6";
import http from "k6/http";
import { Rate } from "k6/metrics";
import { describe, expect } from 'https://jslib.k6.io/k6chaijs/4.3.4.3/index.js';

// Custom metrics for functional tests
const errors = new Rate("errors");
const functionalChecks = new Rate("functional_checks");

// Configuration
const BASE_URL = "http://localhost:8765";

// Test data
const TEST_USER = {
  email: "testcus1@mail.com",
  password: "testcus1",
};

const TEST_ORDER = {
  restaurantId: "6711074323ad9d42043cff5e",
  userId: "0452735e-be9a-499f-93bd-b5a661780c86",
  location: "South",
  deliveryAddress: "01-01  Outram Park, Cantonment Road, People's Park, Outram, Central, Singapore, 088875, Singapore",
  deliveryLatitude: 1.280799664912132,
  deliveryLongitude: 103.83968353271486,
  deliveryFee: 5,
};

// Test configuration for functional tests
export const options = {
  scenarios: {
    functional_tests: {
      executor: "shared-iterations",
      vus: 1,
      iterations: 1,
      maxDuration: "1h",
    },
  },
  thresholds: {
    functional_checks: ["rate>=1"], // All functional checks must pass
    errors: ["rate<0.01"],         // No errors allowed in functional tests
  },
};

// Helper function for response validation
function validateResponse(response, requestName, expectedStatus = 200) {
  const checkResult = check(response, {
    [`${requestName} status is ${expectedStatus}`]: (r) => r.status === expectedStatus,
    [`${requestName} has valid response body`]: (r) => r.body.length > 0,
  });

  if (!checkResult) {
    console.error(`${requestName} validation failed:`, {
      status: response.status,
      body: response.body,
    });
    errors.add(1);
  }
  return checkResult;
}

export function setup() {
  // Perform authentication and return auth token
  const loginResponse = http.post(
    `${BASE_URL}/user/login`,
    JSON.stringify(TEST_USER),
    {
      headers: { "Content-Type": "application/json" },
    }
  );

  if (!validateResponse(loginResponse, "Login")) {
    throw new Error("Authentication failed");
  }

  const authToken = loginResponse.json("token");
  if (!authToken) {
    throw new Error("No auth token received");
  }

  return { authToken };
}

export default function(data) {
  const params = {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${data.authToken}`,
    },
  };

  group("User Authentication Tests", () => {
    describe("Login Functionality", () => {
      // Test invalid credentials
      const invalidLoginResponse = http.post(
        `${BASE_URL}/user/login`,
        JSON.stringify({ email: "invalid@mail.com", password: "wrongpass" }),
        { headers: { "Content-Type": "application/json" } }
      );
      expect(invalidLoginResponse.status, "Invalid login should be rejected").to.equal(401);

      // Test valid credentials
      const validLoginResponse = http.post(
        `${BASE_URL}/user/login`,
        JSON.stringify(TEST_USER),
        { headers: { "Content-Type": "application/json" } }
      );
      expect(validLoginResponse.status, "Valid login should succeed").to.equal(200);
    });
  });

  group("Restaurant Listing Tests", () => {
    describe("Restaurant API", () => {
      const restaurantsResponse = http.get(
        `${BASE_URL}/restaurant-service/restaurants/all`,
        params
      );

      expect(restaurantsResponse.status, "Should get restaurant list").to.equal(200);
      
      const restaurants = restaurantsResponse.json();
      expect(restaurants, "Should return array of restaurants").to.be.an('array');
      expect(restaurants, "Should have at least one restaurant").to.have.lengthOf.above(0);
      
      // Verify restaurant data structure
      const testRestaurant = restaurants.find(r => r._id === TEST_ORDER.restaurantId);
      expect(testRestaurant, "Test restaurant should exist").to.not.be.undefined;
    });
  });

  group("Order Creation Tests", () => {
    describe("Group Food Order Creation", () => {
      const orderDetails = [
        {
          menuId: "6736f708dd18100640edc481",
          menuImageURL: "https://images.pexels.com/photos/7251866/pexels-photo-7251866.jpeg",
          name: "Steamed Dumplings",
          quantity: 1,
          price: 8.99,
        },
        {
          menuId: "6736f708dd18100640edc482",
          menuImageURL: "https://images.pexels.com/photos/7287723/pexels-photo-7287723.jpeg",
          name: "Pan-Fried Dumplings",
          quantity: 1,
          price: 9.99,
        },
      ];

      const orderPayload = {
        ...TEST_ORDER,
        orderDetails: JSON.stringify(orderDetails),
      };

      const orderResponse = http.post(
        `${BASE_URL}/groupFoodOrdersAPI/groupFoodOrder`,
        JSON.stringify(orderPayload),
        params
      );

      expect(orderResponse.status, "Order creation should succeed").to.equal(200);
      
      const orderData = orderResponse.json();
      expect(orderData, "Order should have ID").to.have.property('id');
      expect(orderData, "Order should have restaurantId").to.have.property('restaurantId', TEST_ORDER.restaurantId);
      
      return orderData; // Pass order data to next test
    });
  });

  group("Payment Processing Tests", () => {
    describe("PayNow Payment Processing", (orderData) => {
      const paymentPayload = {
        orderItemId: orderData.id,
        paymentStatus: "PENDING",
        isGroupFoodOrder: true,
        isGetPromo: false,
        totalPrice: 30.97,
        forShow: false,
        paymentType: "payNow",
        payNowMobileNumber: "92325933",
      };

      const paymentResponse = http.put(
        `${BASE_URL}/order-service/UpdatePaymentStatusAPI/updatePayment`,
        JSON.stringify(paymentPayload),
        params
      );

      expect(paymentResponse.status, "Payment update should succeed").to.equal(200);
      
      // Verify payment status
      const verifyPaymentResponse = http.get(
        `${BASE_URL}/order-service/orders/${orderData.id}`,
        params
      );
      
      expect(verifyPaymentResponse.status, "Should get payment status").to.equal(200);
      const paymentStatus = verifyPaymentResponse.json();
      expect(paymentStatus, "Payment status should be updated").to.have.property('paymentStatus');
    });
  });

  // Add think time between user actions
  sleep(Math.random() * 2 + 1);
}

export function teardown(data) {
  if (!data || !data.authToken) {
    console.error("No auth token for cleanup");
    return;
  }

  // Cleanup test data
  const cleanupResponse = http.del(
    `${BASE_URL}/cleanup`,
    null,
    {
      headers: {
        Authorization: `Bearer ${data.authToken}`,
      },
    }
  );

  validateResponse(cleanupResponse, "Cleanup");
}