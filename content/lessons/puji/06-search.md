# 搜索：DFS 与 BFS

## DFS 深度优先搜索

一条路走到底，走不通再退回来换一条（回溯）。零基础路线里的全排列就是 DFS。

**在地图上 DFS（P1605 迷宫）：**

```cpp
int dx[4] = {0, 0, 1, -1}, dy[4] = {1, -1, 0, 0};

void dfs(int x, int y) {
    if (x == fx && y == fy) { ans++; return; }
    for (int i = 0; i < 4; i++) {
        int nx = x + dx[i], ny = y + dy[i];
        if (nx < 1 || nx > n || ny < 1 || ny > m) continue;  // 出界
        if (wall[nx][ny] || vis[nx][ny]) continue;            // 障碍或走过
        vis[nx][ny] = true;
        dfs(nx, ny);
        vis[nx][ny] = false;   // 回溯
    }
}
```

**连通块（P1596 Lake Counting）：** 从每个没访问过的水格子出发 DFS，把能到的格子都标记上，出发了几次就有几个水塘。这种情况**不需要回溯**。

## BFS 广度优先搜索

一圈一圈向外扩展，先到的一定是**最短**的。求"最少步数"首选 BFS。

```cpp
queue<pair<int,int>> q;
q.push({sx, sy}); dis[sx][sy] = 0;
while (!q.empty()) {
    auto [x, y] = q.front(); q.pop();
    for (int i = 0; i < 8; i++) {           // 马有 8 个方向
        int nx = x + dx[i], ny = y + dy[i];
        if (越界 || dis[nx][ny] != -1) continue;
        dis[nx][ny] = dis[x][y] + 1;
        q.push({nx, ny});
    }
}
```

## 剪枝

八皇后（P1219）：用三个数组分别记录列、主对角线（`x - y + n`）、副对角线（`x + y`）是否被占，能大大减少无用的尝试。

## 常见错误

1. 忘记标记已访问，导致重复走、死循环。
2. 回溯时忘记撤销标记（求路径数时需要撤销，求连通块时不需要）。
3. DFS 层数太深导致栈溢出（大地图的连通块可以改用 BFS）。

## 做题建议

DFS：P1605 → P1596 → P1219。BFS：P1135 → P1443。P1141 01迷宫询问很多，要一次把每个连通块的大小算好存起来，不能每次询问都重新搜。
