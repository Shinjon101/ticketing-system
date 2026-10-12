locals {
  prefix = "ticketing-${var.environment}"

  tags = {
    project     = "ticketing"
    environment = var.environment
    managed_by  = "terraform"
  }
}

resource "azurerm_resource_group" "main" {
  location = var.location
  name     = var.resource_group_name
  tags     = local.tags
}

resource "azurerm_kubernetes_cluster" "main" {
  name                = "aks-${local.prefix}"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  dns_prefix          = "${local.prefix}-aks"
  kubernetes_version  = "1.36"
  sku_tier            = "Free"
  network_profile {
    network_plugin = "azure"
  }

  default_node_pool {
    name       = "default"
    node_count = 2
    vm_size    = var.aks_vm_size
    max_count  = 3
    min_count  = 2
  }

  identity {
    type = "SystemAssigned"
  }

  tags = local.tags
}
