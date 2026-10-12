output "kubernetes_cluster_name" {
  value = azurerm_kubernetes_cluster.main.name
}

output "kube_config" {
  value = azurerm_kubernetes_cluster.main.kube_config_raw

  sensitive = true
}

output "location" {
  description = "Azure region, inherited from the target resource group."
  value       = azurerm_resource_group.main.location
}

