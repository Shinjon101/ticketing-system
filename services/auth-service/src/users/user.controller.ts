import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from "@ticketing/common";
import { RequestHandler } from "express";
import { userRepository } from "./user.repository";

export const getProfileHandler: RequestHandler = async (req, res) => {
  // req.user is attached by the authenticate middleware
  const user = await userRepository.findById(req.user.sub);

  if (!user) {
    // Token was valid but user was deleted after it was issued
    throw new NotFoundError("User not found");
  }

  res.status(200).json({
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
    },
  });
};

export const updateRoleHandler: RequestHandler = async (req, res) => {
  const rawId = req.params.id;
  const targetId = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!targetId) {
    throw new BadRequestError("User id is required");
  }

  const user = await userRepository.findById(targetId);
  if (!user) {
    throw new NotFoundError("User not found");
  }
  if (user.role === req.body.role) {
    throw new ConflictError(`Role already is "${user.role}"`);
  }

  const updated = await userRepository.updateRole(targetId, req.body.role);

  res.status(200).json({
    message: "Role updated successfully",
    user: { id: updated!.id, email: updated!.email, role: updated!.role },
  });
};
