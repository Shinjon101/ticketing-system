import { asyncHandler, HttpError } from "@ticketing/common";
import { RequestHandler } from "express";
import { userRepository } from "./user.repository";

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
