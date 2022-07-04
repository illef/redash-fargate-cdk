export interface Config {
  readonly stageName: string;
  readonly vpcId: string | null;
  readonly accountId: string;
  readonly region: string;
  readonly redashImage: string;
}
