import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

public class HashGen {
    public static void main(String[] args) {
        BCryptPasswordEncoder encoder = new BCryptPasswordEncoder(10);
        System.out.println("tia123: " + encoder.encode("tia123"));
        System.out.println("airport123: " + encoder.encode("airport123"));
        System.out.println("rami123: " + encoder.encode("rami123"));
    }
}
