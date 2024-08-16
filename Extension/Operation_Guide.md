# Find Hierarchy & Show all Reference file dump 
**Outline:**  
* Prerequisite
* 下載專案
* 專案建置
* 前端處理
* 後端處理

# Prerequisite
* VS code：  
Extension 所運行的平台，也是很好用的編輯器，而且開源
* Node.js：  
運行 Javascript / Typescript 所需要的環境
* Npm：  
Javascript package manager, the equivalent of pip of Python as to Javascript
* Git：  
版控系統，主要是改好的版本我放在 [Github](https://github.com/Jackiempty/vscode-cpptools.git)，以便管理以及做不同版本間的程式比對

# 下載專案
點選 Download ZIP，當然如果你有安裝 Git 也可以用 clone repository 的方式  
![alt text](readme_image/image.png)  

如果你是下載 ZIP，則請你解壓縮  

**Git clone command:**
```shell
$ git clone https://github.com/Jackiempty/vscode-cpptools.git
```

# 專案建置

1. 打開 VS code
2. 選取 `path/to/cpp-tools/Extensions` 作為 Workspace 資料夾，因為要建置的 extionsion 主體在這
3. 先用 npm 下載 yarn  
```shell
$ npm install -g yarn
```
4. **Run and Debug** 直接按下去
5. 看 npm 套件缺什麼就裝什麼  
```shell
$ npm install -g <package_name>
```

![alt text](readme_image/image-1.png)

6. 重複`4, 5`兩個步驟直到成功建置為止
7. 有時在 console 會問你要不要授權裝什麼，打 yes + enter 就可以了

# 前置步驟
1. 這邊我們暫時沒有像樣一點的輸入介面，只能手動點選想要查找的對象
2. 對你想要查找的函式/變數用滑鼠連點兩下左鍵
3. 按右鍵
4. 找到 Show call hierarchy/Find all reference 按下去
5. 耐心等待 cpp-tools-extension 做資料處理 (由於同步執行流程要一一走訪每個檔案需要一段時間)
6. 當右下角的圈圈沒有再轉就代表已經找完了

# 後端處理
在查找結束後，會在 `./dump_file/` 底下找到 `hierarchy.txt` 或 `reference.txt`，這時裡面會有像圖片裡這樣的文字  

![alt text](image.png)
> hierarchy.txt 裡面的樣子

從文字的排版方式可以看出每個函式之間的階層上下關係，透過縮排區分，但光這樣還是需要自己人工去過濾掉重複的函式，因此這個形式的資料還不夠精練  

![alt text](image-1.png)
> reference.txt 裡面的樣子，包含的資訊有：  
> 第一行：函式/變數名稱，所在檔案路徑以及名稱，函式所在行數

## 使用 read.py 讀取並解析 hierarchy.txt
為了解析 hierarchy.txt 裡面的 raw data，我寫了一個小工具可以將裡面的內容可視化，讓使用者可以一目瞭然所有函式之間的呼叫/被呼叫關係，