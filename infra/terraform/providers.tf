terraform {
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
  }
  backend "azurerm" {
    storage_account_name = "sttfstate14dfbfa6"
    container_name       = "tfstate"
    key                  = "ticketing-dev.tfstate"
    use_azuread_auth     = true
  }
  required_version = ">= 1.9"
}

provider "azurerm" {
  features {}

  subscription_id = var.subscription_id

  resource_provider_registrations = "none"
}
