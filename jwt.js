import jwt from "jsonwebtoken";
import * as process from "node:process";

export function jwtCreate(id, email) {
  return jwt.sign({ id: id, email: email }, process.env.JWT, {
    expiresIn: "24h",
  });
}

export function jwtChecker(token) {
  return jwt.verify(token, process.env.JWT);
}
