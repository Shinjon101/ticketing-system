output "vnet_id" {
  description = "Resource ID of the virtual network."
  value       = azurerm_virtual_network.main.id
}

output "nodes_subnet_id" {
  description = "Resource ID of the AKS node subnet. Feeds default_node_pool.vnet_subnet_id."
  value       = azurerm_subnet.nodes.id
}

output "location" {
  description = "Azure region, inherited from the target resource group."
  value       = data.azurerm_resource_group.main.location
}
