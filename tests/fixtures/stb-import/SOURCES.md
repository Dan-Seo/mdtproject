# ST-Bridge 취입 코퍼스

**원본 `.stb`·`.xsd`는 커밋하지 않는다.** 원본은 `.cache/stb/`에만 두고, 이 문서에는 출처 URL과 SHA-256만 기록한다. 커밋하는 합성 픽스처와 step 2의 중간표현 JSON은 이 원본에서 파생된다.

## 실물 `.stb`

| 저장 파일명 | 출처 repo | 커밋 고정 URL | SHA-256 | bytes | ST-Bridge 버전 | 선언 인코딩 |
|---|---|---|---:|---:|---|---|
| `dotnet-sample1.stb` | `hrntsm/STBDotNet` | https://raw.githubusercontent.com/hrntsm/STBDotNet/2e742685700456ac10a3ed326ca99be75acd6b33/TestStbFiles/ver2/Sample1.stb | `50df079abaf5514d88129b7e0ad194fb959d6bd2757126baebab650072ff391a` | 63177 | 2.0.1 | UTF-8 |
| `diffchecker-filea.stb` | `NS-NS/STB-DiffChecker` | https://raw.githubusercontent.com/NS-NS/STB-DiffChecker/bd9a6eb09d82e58f033e3ee542bf6874196ae924/TestData/FileA.stb | `fb350d0efcec007219ccc73d975175f4f694f422619dbc416ba133b18433ebe2` | 117138 | 2.0.2 | Shift_JIS |
| `hoaryfox-sample.stb` | `hrntsm/HoaryFox` | https://raw.githubusercontent.com/hrntsm/HoaryFox/f991f97df99e307c449c4c0bc0cb85b514cc5e8c/Samples/SampleBuilding.stb | `83d35a8eeb57177d409766804e36288ff325d141d05a7cba4b58fff221257629` | 83288 | 2.0.2 | utf-8 |
| `diffchecker-mini210.stb` | `NS-NS/STB-DiffChecker` | https://raw.githubusercontent.com/NS-NS/STB-DiffChecker/bd9a6eb09d82e58f033e3ee542bf6874196ae924/TestData/Mini210_FileA.stb | `9bf2b7b628d801f87d6d348b53b7628dfc0cc8a05989ace7787e727c697e80c5` | 1606 | 2.1.0 | utf-8 |

## 공식 XSD

| ST-Bridge 버전 | zip URL | zip SHA-256 | XSD 파일명 | XSD SHA-256 | bytes |
|---|---|---|---|---|---:|
| 2.0.1 | https://www.building-smart.or.jp/wp-content/uploads/2022/03/ST-Bridge_v201_20220316.zip | `e9294763477a18f0bc0e19aab629be4d8b1ea7ade085a688766a94dcfa5e4913` | `ST-Bridge_v201_20220316.xsd` | `3eac9a71b08c6be02fcc514b821937d24305fe0662500047108316c88a98005b` | 201033 |
| 2.0.2 | https://www.building-smart.or.jp/wp-content/uploads/2026/04/ST-Bridge_v202.zip | `f69d4ee1c4b162f50a1a05ba13c948996d743924f1eeebd7016de866a5b4da8d` | `ST-Bridge_v202.xsd` | `56cc1b80062c2385c15f8ab0745f4e96ac5b9400a4743307031e813d0253a1fa` | 331047 |
| 2.1.0 | https://www.building-smart.or.jp/wp-content/uploads/2023/05/ST-Bridge210.zip | `b694b2675001b1ac6d894cac66b7e0f357d611fb793f6dedd3d90b6aab07771e` | `ST-Bridge210.xsd` | `9f2038b7b308f411b6397e6cd2d1b0fe82169dd20c1e98cbf7d478a9d7b3583c` | 556507 |
| 2.1.1 | https://www.building-smart.or.jp/wp-content/uploads/2026/07/ST-Bridge_v211.zip | `e4690298e3233e77049633a26a05de3633b7272b5220447f60446591c4cb17fd` | `ST-Bridge_v211.xsd` | `73ab69075c2b8d5d480b40aa34f3b62d34a3d3f3099792afd34a71274343a089` | 558066 |

## 라이선스

`hrntsm/STBDotNet`, `hrntsm/HoaryFox`, `NS-NS/STB-DiffChecker`의 고정 커밋에는 모두 MIT License가 있다. 각 저장소 `LICENSE`의 저작권 표기는 다음과 같다.

- `hrntsm/STBDotNet`: `Copyright (c) 2020 hrntsm`
- `hrntsm/HoaryFox`: `Copyright (c) 2019 hrntsm`
- `NS-NS/STB-DiffChecker`: `Copyright (c) 2020 NS-NS`

커밋하는 합성 `.stb`와 이후 중간표현 JSON은 위 원본에서 파생된 저작물이다. 원본 파일 자체는 재배포하지 않는다.

## 이 코퍼스가 대표하지 못하는 것

step 5에서 실측으로 채운다.

## 재현 절차

```sh
mkdir -p .cache/stb
curl -L --fail 'https://raw.githubusercontent.com/hrntsm/STBDotNet/2e742685700456ac10a3ed326ca99be75acd6b33/TestStbFiles/ver2/Sample1.stb' -o .cache/stb/dotnet-sample1.stb
curl -L --fail 'https://raw.githubusercontent.com/NS-NS/STB-DiffChecker/bd9a6eb09d82e58f033e3ee542bf6874196ae924/TestData/FileA.stb' -o .cache/stb/diffchecker-filea.stb
curl -L --fail 'https://raw.githubusercontent.com/hrntsm/HoaryFox/f991f97df99e307c449c4c0bc0cb85b514cc5e8c/Samples/SampleBuilding.stb' -o .cache/stb/hoaryfox-sample.stb
curl -L --fail 'https://raw.githubusercontent.com/NS-NS/STB-DiffChecker/bd9a6eb09d82e58f033e3ee542bf6874196ae924/TestData/Mini210_FileA.stb' -o .cache/stb/diffchecker-mini210.stb
sha256sum .cache/stb/dotnet-sample1.stb .cache/stb/diffchecker-filea.stb .cache/stb/hoaryfox-sample.stb .cache/stb/diffchecker-mini210.stb
```

공식 XSD zip도 표의 zip URL을 `curl -L --fail <url> -o .cache/stb/<zip 파일명>`으로 내려받은 뒤, zip과 압축 해제한 XSD에 각각 `sha256sum`을 실행해 표와 대조한다.
