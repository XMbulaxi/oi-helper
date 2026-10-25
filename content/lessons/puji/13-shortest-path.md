# 最短路

求从起点到其他各点的最短距离。

## Dijkstra 算法（边权非负时使用）

思路：每次从还没确定的点里，选出距离最小的那个，它的距离就确定了，再用它去更新邻居。

用优先队列优化后，复杂度 O(m log m)：

```cpp
vector<pair<int,int>> g[N];   // g[u] = {v, w}
long long dis[N];
bool done[N];

void dijkstra(int s) {
    fill(dis, dis + N, LLONG_MAX);
    dis[s] = 0;
    priority_queue<pair<long long,int>, vector<pair<long long,int>>, greater<>> q;
    q.push({0, s});
    while (!q.empty()) {
        int u = q.top().second; q.pop();
        if (done[u]) continue;
        done[u] = true;
        for (auto [v, w] : g[u]) {
            if (dis[u] + w < dis[v]) {
                dis[v] = dis[u] + w;
                q.push({dis[v], v});
            }
        }
    }
}
```

## 其他算法简介

- **Floyd**：求任意两点之间的最短路，三层循环，O(n³)，适合 n ≤ 几百。

```cpp
for (int k = 1; k <= n; k++)
    for (int i = 1; i <= n; i++)
        for (int j = 1; j <= n; j++)
            d[i][j] = min(d[i][j], d[i][k] + d[k][j]);
```

  注意 k 必须在最外层。

- **SPFA**：能处理负边权，但可能被特殊数据卡到很慢。没有负边时用 Dijkstra。

## 常见错误

1. 有负边权还用 Dijkstra。
2. 优先队列默认是大根堆，忘了改成小根堆（或者存负数）。
3. 距离初始值设得太小，或者相加时溢出。

## 做题建议

P3371 和 P4779 用同一份 Dijkstra 代码。P4779 专门卡了 SPFA，体会一下为什么要会 Dijkstra。学完这里，普及组的主要内容就学完了。
