"use client";

import { useEffect, useState } from "react";
import { explorerClusterQuery, getClientNetwork } from "@/lib/solana-config";

/** Solana Explorer `?cluster=` suffix for the live server network (not build-time env). */
export function useExplorerCluster(): string {
  const [cluster, setCluster] = useState("");
  useEffect(() => {
    void getClientNetwork().then((network) => setCluster(explorerClusterQuery(network)));
  }, []);
  return cluster;
}
