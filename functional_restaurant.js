import { sleep, check, group } from "k6";
import http from "k6/http";
import { describe, expect } from 'https://jslib.k6.io/k6chaijs/4.3.4.3/index.js';

const BASE_URL = "http://localhost:8765";
const RESTAURANT_ID = "6711074323ad9d42043cff5e";
const STAFF_ID = "8589f685-8161-4743-92d7-4d1908e2133d";

export const options = {
  scenarios: {
    functional_test: {
      executor: 'shared-iterations',
      vus: 1,
      iterations: 1,
      maxDuration: '1h'
    },
  },
  thresholds: {
    checks: ['rate>=0.99']
  },
};

export function setup() {
  const loginResponse = http.post(
    `${BASE_URL}/user/login`,
    JSON.stringify({
      email: "shop1@mail.com",
      password: "shop1",
    }),
    {
      headers: { "Content-Type": "application/json" }
    }
  );

  expect(loginResponse.status, "Login successful").to.equal(200);
  return { authToken: loginResponse.json("token") };
}

export default function (data) {
  const params = {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${data.authToken}`,
    }
  };

  group("Restaurant Authentication", () => {
    describe('Staff Login', () => {
      const invalidLoginResponse = http.post(
        `${BASE_URL}/user/login`,
        JSON.stringify({
          email: "invalid@mail.com",
          password: "wrong"
        }),
        { headers: { "Content-Type": "application/json" } }
      );
      expect(invalidLoginResponse.status, "Invalid login rejected").to.equal(401);
    });
  });

  group("Restaurant Data Access", () => {
    describe('Get Restaurant List', () => {
      const restaurantsResponse = http.get(
        `${BASE_URL}/restaurant-service/restaurants/all`,
        params
      );
      expect(restaurantsResponse.status, "Get restaurants successful").to.equal(200);
      
      const restaurants = restaurantsResponse.json();
      expect(restaurants, "Has restaurant data").to.be.an('array').that.is.not.empty;
    });

    describe('Get Restaurant Orders', () => {
      const ordersResponse = http.get(
        `${BASE_URL}/groupFoodOrdersAPI/getOrdersForRestaurantStaff?userId=${STAFF_ID}&restaurantId=${RESTAURANT_ID}`,
        params
      );
      expect(ordersResponse.status, "Get orders successful").to.equal(200);
      
      const orders = ordersResponse.json();
      expect(orders, "Has orders array").to.be.an('array');
      return orders;
    });
  });

  group("Order Processing Flow", () => {
    describe('Process Submitted Orders', (orders) => {
      const submittedOrders = orders.filter(order => 
        order.orderStatus === "SUBMITTED_TO_RESTAURANT"
      );

      submittedOrders.forEach(order => {
        const acceptResponse = http.put(
          `${BASE_URL}/groupFoodOrdersAPI/kitchenPreparing/${order.groupFoodOrderId}`,
          null,
          params
        );
        expect(acceptResponse.status, "Order accepted successfully").to.equal(200);
        
        // Verify status update
        const verifyResponse = http.get(
          `${BASE_URL}/groupFoodOrdersAPI/getOrdersForRestaurantStaff?userId=${STAFF_ID}&restaurantId=${RESTAURANT_ID}`,
          params
        );
        const updatedOrder = verifyResponse.json().find(o => o.groupFoodOrderId === order.groupFoodOrderId);
        expect(updatedOrder.orderStatus, "Status updated to preparing").to.equal("KITCHEN_PREPARING");
      });
    });

    describe('Process Preparing Orders', (orders) => {
      const preparingOrders = orders.filter(order => 
        order.orderStatus === "KITCHEN_PREPARING"
      );

      preparingOrders.forEach(order => {
        const readyResponse = http.put(
          `${BASE_URL}/groupFoodOrdersAPI/readyForDelivery/${order.groupFoodOrderId}`,
          null,
          params
        );
        expect(readyResponse.status, "Order marked ready successfully").to.equal(200);

        // Verify status update
        const verifyResponse = http.get(
          `${BASE_URL}/groupFoodOrdersAPI/getOrdersForRestaurantStaff?userId=${STAFF_ID}&restaurantId=${RESTAURANT_ID}`,
          params
        );
        const updatedOrder = verifyResponse.json().find(o => o.groupFoodOrderId === order.groupFoodOrderId);
        expect(updatedOrder.orderStatus, "Status updated to ready").to.equal("READY_FOR_DELIVERY");
      });
    });
  });

  sleep(1);
}

export function teardown(data) {
  if (data?.authToken) {
    const cleanupResponse = http.del(
      `${BASE_URL}/cleanup`,
      null,
      {
        headers: {
          Authorization: `Bearer ${data.authToken}`,
        }
      }
    );
    expect(cleanupResponse.status, "Cleanup successful").to.equal(200);
  }
}