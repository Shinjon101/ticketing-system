import { asyncHandler, HttpError } from "@ticketing/common";
import { RequestHandler } from "express";
import { userRepository } from "./user.repository";
import { a } from "vitest/dist/chunks/suite.B2jumIFP.js";

export const getProfileHandler: RequestHandler = asyncHandler(
  async (req, res) => {
    // req.user is attached by the authenticate middleware
    const user = await userRepository.findById(req.user.sub);

    if (!user) {
      // Token was valid but user was deleted after it was issued
      throw new HttpError(404, "User not found");
    }

    res.status(200).json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
      },
    });
  },
);

export const updateRoleHandler: RequestHandler = asyncHandler(
  async (req, res) => {
    const targetId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : req.params.id;
    if (!targetId) {
      throw new HttpError(400, "User id is required");
    }
    const user = await userRepository.findById(targetId);
    if (!user) {
      throw new HttpError(404, "User not found");
    }
    if (user.role === req.body.role) {
      throw new HttpError(409, `Role already is "${user.role}"`);
    }
    await userRepository.updateRole(targetId, req.body.role);

    res.status(200).json({ message: "Role updated successfully" });
  },
);
