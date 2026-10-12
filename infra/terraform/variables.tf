variable "subscription_id" {
  description = "Azure subscription ID. Sourced from ARM_SUBSCRIPTION_ID if not set here."
  type        = string
  default     = null
}

variable "resource_group_name" {
  description = "Name of the main resource group"
  type        = string
  default     = "rg-ticketing-dev"
}

variable "location" {
  description = "Location of the main resource group, aks cluster also set in this location"
  type        = string
  default     = "indiasouthcentral"
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
variable "aks_vm_size" {
  description = "Size of the VM of the nodes for the AKS cluster"
  type        = string
  default     = "Standard_DS2_v2"
}
