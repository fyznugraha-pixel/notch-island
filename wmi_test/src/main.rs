use std::ffi::c_void;
use windows::Win32::NetworkManagement::IpHelper::{IcmpCreateFile, IcmpSendEcho, IcmpCloseHandle};
use windows::Win32::NetworkManagement::IpHelper::ICMP_ECHO_REPLY;

fn main() {
    unsafe {
        if let Ok(handle) = IcmpCreateFile() {
            let ip_addr = 0x08080808u32; // 8.8.8.8 in hex
            let request_data = "ping";
            let mut reply_buffer = vec![0u8; std::mem::size_of::<ICMP_ECHO_REPLY>() + request_data.len() + 8];
            
            let reply_count = IcmpSendEcho(
                handle,
                ip_addr,
                request_data.as_ptr() as *const c_void,
                request_data.len() as u16,
                None,
                reply_buffer.as_mut_ptr() as *mut c_void,
                reply_buffer.len() as u32,
                1000 // 1s timeout
            );
            
            if reply_count > 0 {
                let reply = &*(reply_buffer.as_ptr() as *const ICMP_ECHO_REPLY);
                println!("Ping: {} ms", reply.RoundTripTime);
            } else {
                println!("Ping failed");
            }
            
            let _ = IcmpCloseHandle(handle);
        }
    }
}
