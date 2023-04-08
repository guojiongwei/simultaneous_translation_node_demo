/*
 * @Author: guojiongwei g17637907938@163.com
 * @Date: 2023-04-09 00:05:48
 * @LastEditors: guojiongwei g17637907938@163.com
 * @LastEditTime: 2023-04-09 00:08:01
 * @FilePath: /simultaneous_translation_node_demo/simultaneous_translation.js
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */

const WebSocket = require("ws");
const _thread = require('worker_threads');
const crypto = require("crypto");
const fs = require("fs");

/*
1、同声传译接口，可以将音频流实时翻译为不同语种的文本，并输对应的音频内容，广泛应用于国际论坛、智能会议、智慧教育、跨国交流等场景。
*/

const STATUS_FIRST_FRAME = 0; // 第一帧的标识
const STATUS_CONTINUE_FRAME = 1; // 中间帧标识
const STATUS_LAST_FRAME = 2; // 最后一帧的标识class Ws_Param {
// 初始化
encoding = "raw";

const APPID = ""
const APISecret = ""
const APIKey = ""

class Ws_Param {
  constructor(audioFile) {
    // 控制台鉴权信息
    this.APPID = APPID;
    this.APISecret = APISecret;
    this.APIKey = APIKey;
    this.Host = "ws-api.xf-yun.com";
    this.HttpProto = "HTTP/1.1";
    this.HttpMethod = "GET";
    this.RequestUri = "/v1/private/simult_interpretation";
    this.Algorithm = "hmac-sha256";
    this.url = "ws://" + this.Host + this.RequestUri;

    // 设置测试音频文件
    this.AudioFile = audioFile;
  }

  // 生成url
  create_url() {
    let url = this.url;
    const now = new Date();
    const date = now.toUTCString(); // 将日期转换为RFC1123格式
    let signature_origin = "host: " + this.Host + "\n";
    signature_origin += "date: " + date + "\n";
    signature_origin += "GET " + this.RequestUri + " HTTP/1.1";
    let signature_sha = crypto.createHmac("sha256", this.APISecret).update(signature_origin).digest("base64");
    let authorization_origin = 'api_key="' + this.APIKey + '", algorithm="hmac-sha256", headers="host date request-line", signature="' + signature_sha + '"';
    let authorization = Buffer.from(authorization_origin).toString("base64");
    let v = {
      authorization: authorization,
      date: date,
      host: this.Host,
      serviceId: "simult_interpretation",
    };
    url = url + "?" + "authorization=" + v.authorization + "&date=" + v.date + "&host=" + v.host + "&serviceId=" + v.serviceId;
    return url;
  }

  // 生成参数
  static create_params(appid, status, audio) {
    let param = {
      header: {
        app_id: appid,
        status: status,
      },
      parameter: {
        ist: {
          accent: "mandarin",
          domain: "ist_ed_open",
          language: "zh_cn",
          vto: 15000,
          eos: 150000,
        },
        streamtrans: {
          from: "cn",
          to: "en",
        },
        tts: {
          vcn: "x2_catherine",
          tts_results: {
            encoding: "raw",
            sample_rate: 16000,
            channels: 1,
            bit_depth: 16,
            frame_size: 0,
          },
        },
      },
      payload: {
        data: {
          audio: audio.toString("base64"),
          encoding: "raw",
          sample_rate: 16000,
          seq: 1,
          status: status,
        },
      },
    };
    return param;
  }

  // 收到websocket消息的处理
  on_message(ws, message) {
    // 对结果进行解析
    message = JSON.parse(message.data);
    let status = message["header"]["status"];
    let sid = message["header"]["sid"];
    // 接收到的识别结果写到文本
    if (message["payload"] && message["payload"]["recognition_results"]) {
      let result = message["payload"]["recognition_results"]["text"];
      let asrresult = Buffer.from(result, "base64").toString("utf-8");
      let fs = require("fs");
      fs.appendFileSync("output/text/asr.txt", asrresult);
    }

    // 接收到的翻译结果写到文本
    if (message["payload"] && message["payload"]["streamtrans_results"]) {
      let result = message["payload"]["streamtrans_results"]["text"];
      let transresult = Buffer.from(result, "base64").toString("utf-8");
      console.log(`收到消息`, transresult, result);
      let fs = require("fs");
      fs.appendFileSync("output/text/trans.txt", transresult);
    }

    // 把接收到的音频流合成PCM
    if (message["payload"] && message["payload"]["tts_results"]) {
      let audio = message["payload"]["tts_results"]["audio"];
      audio = Buffer.from(audio, "base64").toString("utf-8");
      let fs = require("fs");
      fs.appendFileSync("output/audio/trans.pcm", audio);
    }

    if (status == 2) {
      console.log("session end ");
      console.log("本次请求的sid==》 " + sid);
      console.log("数据处理完毕，等待实时转译结束！同传后的音频文件请到output/audio/目录查看...");
      setTimeout(function () {
        ws.close();
      }, 1000);
    }
  }

  // 收到websocket错误的处理
  on_error(ws, error) {
    console.log(error);
  }

  // 收到websocket关闭的处理
  on_close(ws) {
    console.log("关闭");
  }

  // 收到websocket连接建立的处理
  on_open(ws) {
    let frameSize = 1280; // 每一帧的音频大小
    let intervel = 0.04; // 发送音频间隔(单位:s)
    let status = STATUS_FIRST_FRAME; // 音频的状态信息，标识音频是第一帧，还是中间帧、最后一帧
    let fs = require("fs");
    let buf = fs.readFileSync(this.AudioFile);
    let index = 0;
    while (true) {
      // 文件结束
      if (index >= buf.length) {
        status = STATUS_LAST_FRAME;
      }
      // 第一帧处理
      // 发送第一帧音频，带business 参数
      // appid 必须带上，只需第一帧发送
      if (status == STATUS_FIRST_FRAME) {
        ws.send(JSON.stringify(Ws_Param.create_params(this.APPID, status, buf.slice(index, index + frameSize))));
        console.log("第一帧已发送...");
        status = STATUS_CONTINUE_FRAME;
      }
      // 中间帧处理
      else if (status == STATUS_CONTINUE_FRAME) {
        ws.send(JSON.stringify(Ws_Param.create_params(this.APPID, status, buf.slice(index, index + frameSize))));
      }
      // 最后一帧处理
      else if (status == STATUS_LAST_FRAME) {
        console.log("最后一帧已发送...");
        ws.send(JSON.stringify(Ws_Param.create_params(this.APPID, status, buf.slice(index, index + frameSize))));
        break;
      }

      // 模拟音频采样间隔
      index += frameSize;
    }
  }

  get_audio_text() {
    const wsUrl = this.create_url();
    // 创建转写、转译的text文本和传译的音频
    fs.writeFileSync("output/text/asr.txt", "");
    fs.writeFileSync("output/text/trans.txt", "");
    fs.writeFileSync("output/audio/trans.pcm", "");
    const ws = new WebSocket(wsUrl);
    ws.onmessage = (message) => {
      this.on_message(ws, message);
    };
    ws.onerror = (error) => {
      this.on_error(ws, error);
    };
    ws.onclose = (e) => {
      this.on_close(ws);
    };
    ws.onopen = () => {
      this.on_open(ws);
    };
  }
}

if (require.main === module) {
  const audio_path = "input/audio/original.pcm";
  const demo = new Ws_Param(audio_path);
  demo.get_audio_text();
}
