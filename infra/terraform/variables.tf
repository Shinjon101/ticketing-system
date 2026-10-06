variable "subscription_id" {
  description = "Azure subscription ID. Sourced from ARM_SUBSCRIPTION_ID if not set here."
  type        = string
  default     = null
}

variable "resource_group_name" {
  description = "Pre-existing resource group that this module deploys into. Created out-of-band via az CLI; read as a data source, never managed here."
  type        = string
  default     = "rg-ticketing-dev"
}

variable "environment" {
  description = "Deployment environment short name. Used in resource naming and tags."
  type        = string
  default     = "dev"

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "environment must be one of: dev, staging, prod."
  }
}

variable "vnet_address_space" {
  description = "CIDR blocks for the virtual network."
  type        = list(string)
  default     = ["10.10.0.0/16"]
}

variable "nodes_subnet_prefix" {
  description = "CIDR for the AKS node subnet. A /24 is sufficient with Azure CNI Overlay, where pod IPs come from a separate overlay range and do not consume subnet addresses."
  type        = string
  default     = "10.10.1.0/24"
}
